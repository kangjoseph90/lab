import { compileEquationExpr } from '../equation';
import type { Equation } from '../equation';
import { GraphGpuRenderer } from './gpu-renderer';
import type { RenderWorkerRequest, RenderWorkerResponse } from './render-protocol';
import type { Viewport } from '../viewport';
import { screenToWorld, worldToScreen } from '../viewport';

export type RenderOptions = {
    backend?: GraphBackend;
    lineWidth: number;
    color: readonly [number, number, number];
};

export type GraphBackend = 'cpu' | 'gpu';

export class GraphRenderer {
    readonly #canvas: HTMLCanvasElement;
    readonly #context: CanvasRenderingContext2D;
    readonly #buffer = document.createElement('canvas');
    readonly #bufferContext: CanvasRenderingContext2D;
    readonly #preview = document.createElement('canvas');
    readonly #previewContext: CanvasRenderingContext2D;
    readonly #worker = new Worker(new URL('./graph.worker.ts', import.meta.url), {
        type: 'module',
    });
    #renderId = 0;
    #pending: { id: number; resolve: () => void; reject: (cause: Error) => void } | undefined;
    #viewport: Viewport | undefined;
    readonly #gpu = new GraphGpuRenderer();
    #equation: Equation | undefined;

    constructor(canvas: HTMLCanvasElement) {
        const context = canvas.getContext('2d');
        const bufferContext = this.#buffer.getContext('2d');
        const previewContext = this.#preview.getContext('2d');
        if (!context) throw new Error('Canvas 2D is not supported.');
        if (!bufferContext) throw new Error('Canvas 2D is not supported.');
        if (!previewContext) throw new Error('Canvas 2D is not supported.');

        this.#canvas = canvas;
        this.#context = context;
        this.#bufferContext = bufferContext;
        this.#previewContext = previewContext;
        this.#worker.onmessage = (event: MessageEvent<RenderWorkerResponse>) =>
            this.#onMessage(event.data);
        this.#worker.onerror = (event) => this.#fail(new Error(event.message));
    }

    setEquation(equation: Equation): void {
        compileEquationExpr(equation);
        this.cancel();
        this.#equation = equation;
        this.#worker.postMessage({ type: 'set-equation', equation } satisfies RenderWorkerRequest);
    }

    beginPan(): void {
        this.cancel();
        this.#preview.width = this.#canvas.width;
        this.#preview.height = this.#canvas.height;
        this.#previewContext.drawImage(this.#canvas, 0, 0);
    }

    previewPan(dx: number, dy: number): void {
        this.#context.fillStyle = '#f7f7f4';
        this.#context.fillRect(0, 0, this.#canvas.width, this.#canvas.height);
        this.#context.drawImage(this.#preview, dx, dy);
    }

    cancel(): void {
        const id = ++this.#renderId;
        this.#worker.postMessage({ type: 'cancel', id } satisfies RenderWorkerRequest);
        this.#pending?.resolve();
        this.#pending = undefined;
    }

    render(viewport: Viewport, options: RenderOptions): Promise<void> {
        this.cancel();
        const id = this.#renderId;
        this.#viewport = viewport;
        this.#buffer.width = this.#canvas.width;
        this.#buffer.height = this.#canvas.height;

        if (options.backend === 'gpu') {
            if (!this.#equation) return Promise.reject(new Error('No equation has been compiled.'));
            return this.#gpu
                .render(
                    this.#equation,
                    viewport,
                    this.#canvas.width,
                    this.#canvas.height,
                    options,
                    () => id === this.#renderId,
                )
                .then((image) => {
                    if (!image || id !== this.#renderId) return;
                    this.#bufferContext.putImageData(image, 0, 0);
                    this.#context.putImageData(image, 0, 0);
                    drawGrid(this.#context, viewport, this.#canvas.width, this.#canvas.height);
                });
        }

        this.#worker.postMessage({
            type: 'render',
            id,
            width: this.#canvas.width,
            height: this.#canvas.height,
            viewport,
            options,
        } satisfies RenderWorkerRequest);

        return new Promise((resolve, reject) => {
            this.#pending = { id, resolve, reject };
        });
    }

    #onMessage(message: RenderWorkerResponse): void {
        if (message.id !== this.#renderId) return;

        if (message.type === 'chunk') {
            const pixels = new Uint8ClampedArray(message.pixels);
            const image = new ImageData(pixels, message.width, message.height);
            this.#bufferContext.putImageData(image, 0, message.y);
            this.#context.putImageData(image, 0, message.y);
            if (this.#viewport) {
                drawGrid(this.#context, this.#viewport, this.#canvas.width, this.#canvas.height, {
                    y: message.y,
                    height: message.height,
                });
            }
            return;
        }

        if (message.type === 'error') {
            this.#fail(new Error(message.message));
            return;
        }

        if (this.#viewport) {
            this.#context.drawImage(this.#buffer, 0, 0);
            drawGrid(this.#context, this.#viewport, this.#canvas.width, this.#canvas.height);
        }
        this.#pending?.resolve();
        this.#pending = undefined;
    }

    #fail(cause: Error): void {
        this.#pending?.reject(cause);
        this.#pending = undefined;
    }
}

function drawGrid(
    context: CanvasRenderingContext2D,
    viewport: Viewport,
    width: number,
    height: number,
    clip?: { y: number; height: number },
): void {
    const step = gridStep(viewport.unitsPerPixel * 90);
    const topLeft = screenToWorld({ x: 0, y: 0 }, { x: width, y: height }, viewport);
    const bottomRight = screenToWorld({ x: width, y: height }, { x: width, y: height }, viewport);

    context.save();
    if (clip) {
        context.beginPath();
        context.rect(0, clip.y, width, clip.height);
        context.clip();
    }
    context.lineWidth = 1;
    context.strokeStyle = '#deded8';
    context.beginPath();

    for (let x = Math.ceil(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
        const screen = worldToScreen({ x, y: 0 }, { x: width, y: height }, viewport);
        context.moveTo(Math.round(screen.x) + 0.5, 0);
        context.lineTo(Math.round(screen.x) + 0.5, height);
    }

    for (let y = Math.ceil(bottomRight.y / step) * step; y <= topLeft.y; y += step) {
        const screen = worldToScreen({ x: 0, y }, { x: width, y: height }, viewport);
        context.moveTo(0, Math.round(screen.y) + 0.5);
        context.lineTo(width, Math.round(screen.y) + 0.5);
    }

    context.stroke();
    const origin = worldToScreen({ x: 0, y: 0 }, { x: width, y: height }, viewport);
    context.strokeStyle = '#8a8e91';
    context.beginPath();
    context.moveTo(0, Math.round(origin.y) + 0.5);
    context.lineTo(width, Math.round(origin.y) + 0.5);
    context.moveTo(Math.round(origin.x) + 0.5, 0);
    context.lineTo(Math.round(origin.x) + 0.5, height);
    context.stroke();
    context.restore();
}

function gridStep(target: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(target));
    const normalized = target / magnitude;
    const factor = normalized < 2 ? 2 : normalized < 5 ? 5 : 10;
    return factor * magnitude;
}
