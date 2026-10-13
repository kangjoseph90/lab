import { afterEach, describe, expect, it, vi } from 'vitest';
import { fractalViewport } from '../viewport';
import { FractalGpuRenderer } from './gpu-renderer';
import { NUMBER_SHADER, PERTURBATION_SHADER } from './gpu-shaders';
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

afterEach(() => vi.unstubAllGlobals());

describe('FractalGpuRenderer perturbation warnings', () => {
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
            await renderer.render(fractalViewport(-1, 0, 0.02), options, () => true),
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
