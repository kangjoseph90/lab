/// <reference lib="webworker" />

import { complex } from '@lab/math';
import { iterateComplexFractal, julia, mandelbrot } from '@lab/fractal';
import type { FractalRenderWorkerRequest, FractalRenderWorkerResponse } from './render-protocol';

const worker = self as DedicatedWorkerGlobalScope;
let activeRenderId = 0;

worker.onmessage = (event: MessageEvent<FractalRenderWorkerRequest>) => {
    const message = event.data;

    if (message.type === 'cancel') {
        activeRenderId = message.id;
        return;
    }

    activeRenderId = message.id;
    void render(message);
};

async function render(request: Extract<FractalRenderWorkerRequest, { type: 'render' }>) {
    try {
        const { id, width, height, viewport, options } = request;
        const chunkHeight = 24;
        const fractal =
            options.fractal.type === 'mandelbrot'
                ? mandelbrot
                : julia(complex(options.fractal.c.re, options.fractal.c.im));

        for (let startY = 0; startY < height; startY += chunkHeight) {
            if (id !== activeRenderId) return;

            const rows = Math.min(chunkHeight, height - startY);
            const pixels = new Uint8ClampedArray(width * rows * 4);

            for (let py = startY; py < startY + rows; py += 1) {
                const y = viewport.centerY - (py - height / 2) * viewport.unitsPerPixel;

                for (let px = 0; px < width; px += 1) {
                    const x = viewport.centerX + (px - width / 2) * viewport.unitsPerPixel;
                    const result = iterateComplexFractal(fractal, complex(x, y), {
                        maxIterations: options.maxIterations,
                    });
                    const offset = ((py - startY) * width + px) * 4;
                    const [r, g, b] = colorize(result.status, result.smoothIteration);

                    pixels[offset] = r;
                    pixels[offset + 1] = g;
                    pixels[offset + 2] = b;
                    pixels[offset + 3] = 255;
                }
            }

            post({ type: 'chunk', id, y: startY, width, height: rows, pixels: pixels.buffer }, [
                pixels.buffer,
            ]);
            await yieldToMessages();
        }

        if (id === activeRenderId) post({ type: 'complete', id });
    } catch (cause) {
        post({
            type: 'error',
            id: request.id,
            message: cause instanceof Error ? cause.message : String(cause),
        });
    }
}

function colorize(status: 'escaped' | 'bounded', smoothIteration: number | undefined) {
    if (status === 'bounded') return [18, 20, 22] as const;

    const t = smoothIteration === undefined ? 0 : smoothIteration;
    const wave = 0.5 + 0.5 * Math.cos(t * 0.12);
    const r = Math.round(35 + 145 * wave);
    const g = Math.round(82 + 112 * (1 - wave));
    const b = Math.round(128 + 80 * Math.sin(t * 0.08) ** 2);

    return [r, g, b] as const;
}

function post(message: FractalRenderWorkerResponse, transfer: Transferable[] = []): void {
    worker.postMessage(message, transfer);
}

function yieldToMessages(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
