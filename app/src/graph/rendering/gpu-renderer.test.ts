import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEquation } from '../equation';
import { GraphGpuRenderer } from './gpu-renderer';

const viewport = { centerX: 0, centerY: 0, unitsPerPixel: 0.01 };
const options = { lineWidth: 1.35, color: [19, 105, 196] as const };
const equation = parseEquation('x^2 + y^2 = 4');

function setup() {
    const buffers: Array<{
        destroy: ReturnType<typeof vi.fn>;
        unmap: ReturnType<typeof vi.fn>;
        mapAsync: ReturnType<typeof vi.fn>;
        getMappedRange: ReturnType<typeof vi.fn>;
    }> = [];
    let lose!: () => void;
    const pass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups: vi.fn(),
        end: vi.fn(),
    };
    const encoder = {
        beginComputePass: () => pass,
        copyBufferToBuffer: vi.fn(),
        finish: vi.fn(),
    };
    const pipeline = { getBindGroupLayout: vi.fn() };
    const compilation = vi.fn(async () => ({
        messages: [] as { type: string; message: string }[],
    }));
    const device = {
        limits: { maxStorageBufferBindingSize: 1e9, maxBufferSize: 1e9 },
        lost: new Promise<void>((resolve) => {
            lose = resolve;
        }),
        queue: { writeBuffer: vi.fn(), submit: vi.fn() },
        createShaderModule: vi.fn(() => ({ getCompilationInfo: compilation })),
        createComputePipelineAsync: vi.fn(async () => pipeline),
        createBindGroup: vi.fn(),
        createCommandEncoder: () => encoder,
        createBuffer: vi.fn(({ size }: { size: number }) => {
            const buffer = {
                destroy: vi.fn(),
                unmap: vi.fn(),
                mapAsync: vi.fn(async () => {}),
                getMappedRange: vi.fn(() => new ArrayBuffer(size)),
            };
            buffers.push(buffer);
            return buffer;
        }),
        pushErrorScope: vi.fn(),
        popErrorScope: vi.fn(async (): Promise<{ message: string } | null> => null),
    };
    const requestDevice = vi.fn(async () => device);
    const requestAdapter = vi.fn(
        async (): Promise<{ requestDevice: typeof requestDevice } | null> => ({ requestDevice }),
    );
    vi.stubGlobal('navigator', { gpu: { requestAdapter } });
    vi.stubGlobal('GPUBufferUsage', {
        UNIFORM: 1,
        COPY_DST: 2,
        STORAGE: 4,
        COPY_SRC: 8,
        MAP_READ: 16,
    });
    vi.stubGlobal('GPUMapMode', { READ: 1 });
    vi.stubGlobal(
        'ImageData',
        class {
            constructor(
                public data: Uint8ClampedArray,
                public width: number,
                public height: number,
            ) {}
        },
    );
    const renderer = new GraphGpuRenderer();
    const render = (isCurrent = () => true) =>
        renderer.render(equation, viewport, 17, 11, options, isCurrent);
    return {
        renderer,
        render,
        device,
        buffers,
        pass,
        encoder,
        requestAdapter,
        requestDevice,
        compilation,
        lose: () => lose(),
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('GraphGpuRenderer', () => {
    it('renders multiple equations in one dispatch and changes colors without recompiling', async () => {
        const state = setup();
        const second = parseEquation('y < x');
        const layers = [
            { equation, color: [19, 105, 196] as const },
            { equation: second, color: [220, 30, 40] as const },
        ];
        await state.renderer.renderLayers(layers, viewport, 17, 11, options, () => true);
        expect(state.pass.dispatchWorkgroups).toHaveBeenCalledTimes(1);
        expect(state.buffers).toHaveLength(3);
        const firstUniforms = state.device.queue.writeBuffer.mock
            .calls[0]![2] as unknown as Float32Array;
        expect([...firstUniforms.slice(8)]).toEqual([19, 105, 196, 0, 220, 30, 40, 0]);
        await state.renderer.renderLayers(
            [{ ...layers[0]!, color: [0, 180, 80] }, layers[1]!],
            viewport,
            17,
            11,
            options,
            () => true,
        );
        expect(state.device.createComputePipelineAsync).toHaveBeenCalledTimes(1);
        const uniforms = state.device.queue.writeBuffer.mock
            .calls[1]![2] as unknown as Float32Array;
        expect([...uniforms.slice(8, 12)]).toEqual([0, 180, 80, 0]);
    });

    it('covers partial workgroups and reuses a pipeline when only the view changes', async () => {
        const state = setup();
        const image = await state.render();
        expect(image?.width).toBe(17);
        expect(image?.height).toBe(11);
        expect(image?.data.byteLength).toBe(17 * 11 * 4);
        expect(state.pass.dispatchWorkgroups).toHaveBeenCalledWith(3, 2);
        await state.renderer.render(
            equation,
            { ...viewport, centerX: 1 },
            17,
            11,
            options,
            () => true,
        );
        expect(state.requestAdapter).toHaveBeenCalledTimes(1);
        expect(state.device.createComputePipelineAsync).toHaveBeenCalledTimes(1);
        expect(state.buffers).toHaveLength(6);
        for (const buffer of state.buffers) expect(buffer.destroy).toHaveBeenCalledTimes(1);
        expect(state.buffers[2]!.unmap).toHaveBeenCalledTimes(1);
        expect(state.buffers[5]!.unmap).toHaveBeenCalledTimes(1);
    });

    it('does no shader or buffer work for a request cancelled during device initialization', async () => {
        const state = setup();
        expect(await state.render(() => false)).toBeUndefined();
        expect(state.device.createShaderModule).not.toHaveBeenCalled();
        expect(state.buffers).toHaveLength(0);
    });

    it('discards a stale readback and unmaps and destroys every buffer', async () => {
        const state = setup();
        let current = true;
        const createBuffer = state.device.createBuffer.getMockImplementation()!;
        state.device.createBuffer.mockImplementation((descriptor) => {
            const buffer = createBuffer(descriptor);
            buffer.mapAsync.mockImplementation(async () => {
                current = false;
            });
            return buffer;
        });
        expect(await state.render(() => current)).toBeUndefined();
        expect(state.buffers[2]!.getMappedRange).not.toHaveBeenCalled();
        expect(state.buffers[2]!.unmap).toHaveBeenCalledTimes(1);
        for (const buffer of state.buffers) expect(buffer.destroy).toHaveBeenCalledTimes(1);
    });

    it('cleans up when mapping fails', async () => {
        const state = setup();
        const createBuffer = state.device.createBuffer.getMockImplementation()!;
        state.device.createBuffer.mockImplementation((descriptor) => {
            const buffer = createBuffer(descriptor);
            buffer.mapAsync.mockRejectedValue(new Error('Device lost'));
            return buffer;
        });
        await expect(state.render()).rejects.toThrow('Device lost');
        for (const buffer of state.buffers) expect(buffer.destroy).toHaveBeenCalledTimes(1);
        expect(state.buffers[2]!.unmap).not.toHaveBeenCalled();
    });

    it('surfaces validation errors before mapping invalid buffers', async () => {
        const state = setup();
        state.device.popErrorScope.mockResolvedValueOnce({ message: 'Invalid bind group' });
        await expect(state.render()).rejects.toThrow('Invalid bind group');
        expect(state.buffers[2]!.mapAsync).not.toHaveBeenCalled();
        for (const buffer of state.buffers) expect(buffer.destroy).toHaveBeenCalledTimes(1);
        expect(state.device.pushErrorScope).toHaveBeenCalledTimes(1);
        expect(state.device.popErrorScope).toHaveBeenCalledTimes(1);
    });

    it('reports compilation errors and allows retry rather than caching a failure', async () => {
        const state = setup();
        state.compilation.mockResolvedValueOnce({
            messages: [{ type: 'error', message: 'Bad shader' }],
        });
        await expect(state.render()).rejects.toThrow('Bad shader');
        expect(state.buffers).toHaveLength(0);
        expect(await state.render()).toBeDefined();
        expect(state.device.createShaderModule).toHaveBeenCalledTimes(2);
    });

    it('reports unavailable WebGPU and retries adapter discovery on the next request', async () => {
        const state = setup();
        state.requestAdapter.mockResolvedValueOnce(null);
        await expect(state.render()).rejects.toThrow('Select CPU');
        expect(await state.render()).toBeDefined();
        expect(state.requestAdapter).toHaveBeenCalledTimes(2);
    });

    it('rejects views where f32 cannot resolve adjacent pixels', async () => {
        const state = setup();
        await expect(
            state.renderer.render(
                equation,
                { centerX: 1, centerY: 0, unitsPerPixel: 1e-10 },
                17,
                11,
                options,
                () => true,
            ),
        ).rejects.toThrow('Select CPU');
        expect(state.buffers).toHaveLength(0);
    });

    it('invalidates cached pipelines and reacquires the device after device loss', async () => {
        const state = setup();
        await state.render();
        state.lose();
        await Promise.resolve();
        await state.render();
        expect(state.requestAdapter).toHaveBeenCalledTimes(2);
        expect(state.device.createComputePipelineAsync).toHaveBeenCalledTimes(2);
    });
});
