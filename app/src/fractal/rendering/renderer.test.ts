import { afterEach, describe, expect, it, vi } from 'vitest';
import { fractalViewport } from '../viewport';
import { FractalGpuRenderer } from './gpu-renderer';
import { FractalRenderer } from './renderer';
import type { RenderOptions } from './renderer';
import type { FractalRenderWorkerResponse } from './render-protocol';

const viewport = fractalViewport(-0.5, 0, 0.005);
const options: RenderOptions = {
    fractal: { type: 'mandelbrot' },
    maxIterations: 256,
    precision: 'number',
    backend: 'gpu',
    perturbation: true,
};

function setup() {
    const context = { putImageData: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn() };
    const canvas = { width: 8, height: 8, getContext: () => context };
    vi.stubGlobal('document', { createElement: () => canvas });
    let worker!: { onmessage: (event: { data: FractalRenderWorkerResponse }) => void };
    vi.stubGlobal(
        'Worker',
        class {
            postMessage = vi.fn();
            onmessage!: (event: { data: FractalRenderWorkerResponse }) => void;
            constructor() {
                worker = this;
            }
        },
    );
    const gpu = vi.spyOn(FractalGpuRenderer.prototype, 'render');
    const renderer = new FractalRenderer(canvas as unknown as HTMLCanvasElement);
    return {
        renderer,
        gpu,
        respond: (data: FractalRenderWorkerResponse) => worker.onmessage({ data }),
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('FractalRenderer fallback warnings', () => {
    it('propagates CPU warnings and ignores stale worker completion warnings', async () => {
        const { renderer, respond } = setup();
        const cpuOptions = { ...options, backend: 'cpu' as const };
        const first = renderer.render(viewport, cpuOptions);
        respond({ type: 'complete', id: 1, warning: 'perturbation-anchor-unavailable' });
        expect(await first).toBe('perturbation-anchor-unavailable');
        const cancelled = renderer.render(viewport, cpuOptions);
        const latest = renderer.render(viewport, cpuOptions);
        expect(await cancelled).toBeUndefined();
        respond({ type: 'complete', id: 2, warning: 'perturbation-anchor-unavailable' });
        respond({ type: 'complete', id: 3 });
        expect(await latest).toBeUndefined();
    });
    it('propagates the missing-anchor warning', async () => {
        const { renderer, gpu } = setup();
        gpu.mockResolvedValue('perturbation-anchor-unavailable');
        expect(await renderer.render(viewport, options)).toBe('perturbation-anchor-unavailable');
    });

    it('warns when a failed perturbation render succeeds without perturbation', async () => {
        const { renderer, gpu } = setup();
        gpu.mockRejectedValueOnce(new Error('Perturbation failed')).mockResolvedValueOnce();
        expect(await renderer.render(viewport, options)).toBe('perturbation-failed');
        expect(gpu).toHaveBeenLastCalledWith(
            viewport,
            { ...options, perturbation: false },
            expect.any(Function),
        );
    });

    it('suppresses a fallback warning if the render is cancelled during the retry', async () => {
        const { renderer, gpu } = setup();
        let finish!: () => void;
        gpu.mockRejectedValueOnce(new Error('Perturbation failed')).mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        const render = renderer.render(viewport, options);
        await Promise.resolve();
        renderer.cancel();
        finish();
        expect(await render).toBeUndefined();
    });

    it('surfaces the error if direct rendering also fails', async () => {
        const { renderer, gpu } = setup();
        gpu.mockRejectedValue(new Error('GPU unavailable'));
        await expect(renderer.render(viewport, options)).rejects.toThrow('GPU unavailable');
    });
});
