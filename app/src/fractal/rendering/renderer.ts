import type { FractalViewport } from '../viewport';
import { FractalGpuRenderer } from './gpu-renderer';
import type { FractalRenderWorkerRequest, FractalRenderWorkerResponse } from './render-protocol';

export type RenderOptions = {
    fractal: FractalConfig;
    maxIterations: number;
    precision: FractalPrecision;
    backend: FractalBackend;
    perturbation: boolean;
};

export type FractalPrecision = 'number' | 'double-double';
export type FractalBackend = 'cpu' | 'gpu';

export type FractalRenderWarning = 'perturbation-anchor-unavailable' | 'perturbation-failed';

export type FractalConfig =
    | { type: 'mandelbrot' }
    | { type: 'julia'; c: { re: number; im: number } };

export class FractalRenderer {
    readonly #canvas: HTMLCanvasElement;
    readonly #context: CanvasRenderingContext2D;
    readonly #gpu: FractalGpuRenderer;
    readonly #preview = document.createElement('canvas');
    readonly #previewContext: CanvasRenderingContext2D;
    readonly #worker = new Worker(new URL('./fractal.worker.ts', import.meta.url), {
        type: 'module',
    });
    #renderId = 0;
    #pending: { id: number; resolve: () => void; reject: (cause: Error) => void } | undefined;

    constructor(canvas: HTMLCanvasElement) {
        const context = canvas.getContext('2d');
        const previewContext = this.#preview.getContext('2d');
        if (!context) throw new Error('Canvas 2D is not supported.');
        if (!previewContext) throw new Error('Canvas 2D is not supported.');

        this.#canvas = canvas;
        this.#context = context;
        this.#previewContext = previewContext;
        this.#gpu = new FractalGpuRenderer(canvas, context);
        this.#worker.onmessage = (event: MessageEvent<FractalRenderWorkerResponse>) =>
            this.#onMessage(event.data);
        this.#worker.onerror = (event) => this.#fail(new Error(event.message));
    }

    beginPan(): void {
        this.cancel();
        this.#preview.width = this.#canvas.width;
        this.#preview.height = this.#canvas.height;
        this.#previewContext.drawImage(this.#canvas, 0, 0);
    }

    previewPan(dx: number, dy: number): void {
        this.#context.fillStyle = '#111316';
        this.#context.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
        this.#context.drawImage(this.#preview, dx, dy);
    }

    cancel(): void {
        const id = ++this.#renderId;
        this.#worker.postMessage({ type: 'cancel', id } satisfies FractalRenderWorkerRequest);
        this.#pending?.resolve();
        this.#pending = undefined;
    }

    render(
        viewport: FractalViewport,
        options: RenderOptions,
    ): Promise<FractalRenderWarning | void> {
        this.#pending?.resolve();
        const id = ++this.#renderId;

        if (options.backend === 'gpu') {
            return this.#gpu
                .render(viewport, options, () => id === this.#renderId)
                .catch(async (cause) => {
                    if (id !== this.#renderId) return;
                    if (options.perturbation) {
                        await this.#gpu.render(
                            viewport,
                            { ...options, perturbation: false },
                            () => id === this.#renderId,
                        );
                        if (id === this.#renderId) return 'perturbation-failed' as const;
                        return;
                    }

                    throw cause;
                });
        }

        return this.#renderCpu(id, viewport, options);
    }

    #renderCpu(id: number, viewport: FractalViewport, options: RenderOptions): Promise<void> {
        this.#worker.postMessage({
            type: 'render',
            id,
            width: this.#canvas.width,
            height: this.#canvas.height,
            viewport,
            options,
        } satisfies FractalRenderWorkerRequest);

        return new Promise((resolve, reject) => {
            this.#pending = { id, resolve, reject };
        });
    }

    #onMessage(message: FractalRenderWorkerResponse): void {
        if (message.id !== this.#renderId) return;

        if (message.type === 'chunk') {
            const pixels = new Uint8ClampedArray(message.pixels);
            const image = new ImageData(pixels, message.width, message.height);
            this.#context.putImageData(image, 0, message.y);
            return;
        }

        if (message.type === 'error') {
            this.#fail(new Error(message.message));
            return;
        }

        this.#pending?.resolve();
        this.#pending = undefined;
    }

    #fail(cause: Error): void {
        this.#pending?.reject(cause);
        this.#pending = undefined;
    }
}
