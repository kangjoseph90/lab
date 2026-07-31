/// <reference lib="webworker" />

import { dd, ddAdd, ddMul, ddSub, ddToNumber } from '@lab/precision';
import type { DoubleDouble } from '@lab/precision';
import {
    ddComplex,
    iterateJuliaPoint,
    iterateJuliaPointDD,
    iterateMandelbrotPoint,
    iterateMandelbrotPointDD,
} from '@lab/fractal';
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
        const useDoubleDouble = options.precision === 'double-double';
        const numberViewport = {
            centerX: ddToNumber(viewport.centerX),
            centerY: ddToNumber(viewport.centerY),
            unitsPerPixel: ddToNumber(viewport.unitsPerPixel),
        };
        const halfWidthOffset = useDoubleDouble
            ? ddMul(dd(width / 2), viewport.unitsPerPixel)
            : undefined;

        for (let startY = 0; startY < height; startY += chunkHeight) {
            if (id !== activeRenderId) return;

            const rows = Math.min(chunkHeight, height - startY);
            const pixels = new Uint8ClampedArray(width * rows * 4);

            for (let py = startY; py < startY + rows; py += 1) {
                const y = numberViewport.centerY - (py - height / 2) * numberViewport.unitsPerPixel;
                const yDD = useDoubleDouble
                    ? ddSub(viewport.centerY, ddMul(dd(py - height / 2), viewport.unitsPerPixel))
                    : undefined;
                let x = numberViewport.centerX - (width / 2) * numberViewport.unitsPerPixel;
                let xDD = useDoubleDouble ? ddSub(viewport.centerX, halfWidthOffset!) : undefined;

                for (let px = 0; px < width; px += 1) {
                    const result =
                        useDoubleDouble && xDD && yDD
                            ? renderPointDoubleDouble(options, xDD, yDD)
                            : renderPointNumber(options, x, y);
                    const offset = ((py - startY) * width + px) * 4;
                    const [r, g, b] = colorize(result.status, result.smoothIteration);

                    pixels[offset] = r;
                    pixels[offset + 1] = g;
                    pixels[offset + 2] = b;
                    pixels[offset + 3] = 255;

                    x += numberViewport.unitsPerPixel;
                    if (xDD) xDD = ddAdd(xDD, viewport.unitsPerPixel);
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

function renderPointNumber(
    options: Extract<FractalRenderWorkerRequest, { type: 'render' }>['options'],
    x: number,
    y: number,
) {
    if (options.fractal.type === 'mandelbrot') {
        return iterateMandelbrotPoint(x, y, options.maxIterations);
    }

    return iterateJuliaPoint(
        x,
        y,
        options.fractal.c.re,
        options.fractal.c.im,
        options.maxIterations,
    );
}

function renderPointDoubleDouble(
    options: Extract<FractalRenderWorkerRequest, { type: 'render' }>['options'],
    x: DoubleDouble,
    y: DoubleDouble,
) {
    if (options.fractal.type === 'mandelbrot') {
        return iterateMandelbrotPointDD(ddComplex(x, y), options.maxIterations);
    }

    return iterateJuliaPointDD(
        ddComplex(x, y),
        ddComplex(options.fractal.c.re, options.fractal.c.im),
        options.maxIterations,
    );
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
