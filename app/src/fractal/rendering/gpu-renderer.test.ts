import { afterEach, describe, expect, it, vi } from 'vitest';
import { fractalViewport } from '../viewport';
import { FractalGpuRenderer } from './gpu-renderer';
import { NUMBER_SHADER, PERTURBATION_SHADER } from './gpu-shaders';
import { PerturbationOrbitFinder } from './perturbation-orbits';
import type { RenderOptions } from './renderer';

const options: RenderOptions = {
    fractal: { type: 'mandelbrot' },
    maxIterations: 16,
    precision: 'number',
    backend: 'gpu',
    perturbation: true,
};

function setup(width = 8, height = 8) {
    const pass = {
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups: vi.fn(),
        end: vi.fn(),
    };
    const device = {
        queue: { writeBuffer: vi.fn(), submit: vi.fn() },
        createShaderModule: vi.fn(),
        createComputePipelineAsync: vi.fn(async () => ({ getBindGroupLayout: vi.fn() })),
        createBindGroup: vi.fn(),
        createCommandEncoder: () => ({
            beginComputePass: () => pass,
            copyBufferToBuffer: vi.fn(),
            finish: vi.fn(),
        }),
        createBuffer: ({ size }: { size: number }) => ({
            mapAsync: async () => {},
            getMappedRange: () => new ArrayBuffer(size),
            unmap: vi.fn(),
            destroy: vi.fn(),
        }),
    };
    vi.stubGlobal('navigator', {
        gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) },
    });
    vi.stubGlobal('GPUBufferUsage', {
        UNIFORM: 1,
        COPY_DST: 2,
        STORAGE: 4,
        COPY_SRC: 8,
        MAP_READ: 16,
    });
    vi.stubGlobal('GPUMapMode', { READ: 1 });
    vi.stubGlobal('ImageData', class {});
    const context = { putImageData: vi.fn() };
    const renderer = new FractalGpuRenderer(
        { width, height } as HTMLCanvasElement,
        context as unknown as CanvasRenderingContext2D,
    );
    return { renderer, device, context };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('FractalGpuRenderer perturbation warnings', () => {
    it('changes AA through uniforms while retaining the pipeline, pixel buffer size, and reference cache', async () => {
        const { renderer, device } = setup();
        const finder = vi.spyOn(PerturbationOrbitFinder.prototype, 'createTileOrbits');
        const view = fractalViewport(-0.5, 0, 0.005);
        for (const antialiasing of [1, 4, 9] as const) {
            device.queue.writeBuffer.mockClear();
            await renderer.render(view, { ...options, antialiasing }, () => true);
            const uniforms = device.queue.writeBuffer.mock.calls[0]![2] as unknown as Float32Array;
            expect(uniforms[7]).toBe(antialiasing === 1 ? 1 : antialiasing === 4 ? 2 : 3);
        }
        expect(device.createComputePipelineAsync).toHaveBeenCalledTimes(1);
        expect(finder.mock.results[1]!.value.evaluatedCandidates).toBe(0);
        expect(finder.mock.results[2]!.value.evaluatedCandidates).toBe(0);
    });
    it('retains the reference finder between GPU frames', async () => {
        const { renderer } = setup();
        const find = vi.spyOn(PerturbationOrbitFinder.prototype, 'createTileOrbits');
        const view = fractalViewport(-0.5, 0, 0.005);
        await renderer.render(view, options, () => true);
        await renderer.render(view, options, () => true);
        expect(find.mock.results[0]!.value.evaluatedCandidates).toBe(1);
        expect(find.mock.results[1]!.value.evaluatedCandidates).toBe(0);
        expect(find.mock.results[1]!.value.reusedAnchors).toBe(1);
    });
    it('warns when every anchor escapes and still draws the direct GPU result', async () => {
        const { renderer, device, context } = setup();
        expect(await renderer.render(fractalViewport(3, 3, 0.005), options, () => true)).toBe(
            'perturbation-anchor-unavailable',
        );
        expect(device.createShaderModule).toHaveBeenCalledWith({ code: NUMBER_SHADER });
        expect(context.putImageData).toHaveBeenCalledOnce();
    });

    it('does not warn when perturbation is disabled', async () => {
        const { renderer } = setup();
        expect(
            await renderer.render(
                fractalViewport(3, 3, 0.005),
                { ...options, perturbation: false },
                () => true,
            ),
        ).toBeUndefined();
    });

    it('does not warn when missing tile anchors can borrow a stable anchor', async () => {
        const { renderer, device } = setup(128, 64);
        expect(
            await renderer.render(fractalViewport(0.5, 0, 0.02), options, () => true),
        ).toBeUndefined();
        expect(device.createShaderModule).toHaveBeenCalledWith({ code: PERTURBATION_SHADER });
    });

    it('suppresses the warning and canvas update for a cancelled render', async () => {
        const { renderer, context } = setup();
        expect(
            await renderer.render(fractalViewport(3, 3, 0.005), options, () => false),
        ).toBeUndefined();
        expect(context.putImageData).not.toHaveBeenCalled();
    });
});
