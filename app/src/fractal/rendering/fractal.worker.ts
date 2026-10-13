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
import { PerturbationOrbitFinder } from './perturbation-orbits';
import type { TileOrbits } from './perturbation-orbits';
import { iteratePerturbedPoint } from './cpu-perturbation';
import type { FractalRenderWarning } from './renderer';
import { sampleOffsets, fractalColor, toLinear, toDisplayByte } from './antialiasing';
import { deepZoomArithmetic } from './deep-zoom';

const worker = self as DedicatedWorkerGlobalScope;
let activeRenderId = 0;
const orbitFinder = new PerturbationOrbitFinder('cpu');

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
        const offsets = sampleOffsets(options.antialiasing);
        const useDoubleDouble = options.precision === 'double-double';
        const arithmetic = options.perturbation
            ? deepZoomArithmetic(viewport, options.precision)
            : undefined;
        const chunkHeight = arithmetic ? 1 : Math.max(1, Math.floor(24 / offsets.length));
        let references: TileOrbits | undefined;
        let warning: FractalRenderWarning | undefined;
        if (options.perturbation) {
            try {
                references = orbitFinder.createTileOrbits(
                    viewport,
                    width,
                    height,
                    options.maxIterations,
                    options.precision,
                    options.fractal,
                );
                if (references.anchorCount === 0) {
                    references = undefined;
                    warning = 'perturbation-anchor-unavailable';
                }
            } catch {
                warning = 'perturbation-failed';
            }
            await yieldToMessages();
        }
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
                    const tile = references
                        ? Math.floor(py / references.tileSize) * references.tilesX +
                          Math.floor(px / references.tileSize)
                        : undefined;
                    let r = 0,
                        g = 0,
                        b = 0;
                    for (const [ox, oy] of offsets) {
                        const perturbed = references
                            ? iteratePerturbedPoint(
                                  references,
                                  px + ox,
                                  py + oy,
                                  numberViewport.unitsPerPixel,
                                  options.maxIterations,
                                  options.fractal,
                                  tile,
                              )
                            : undefined;
                        const result =
                            perturbed ??
                            (arithmetic
                                ? arithmetic.iterate(
                                      arithmetic.point(px + ox, py + oy, width, height),
                                      options.maxIterations,
                                      options.fractal,
                                  )
                                : useDoubleDouble && xDD && yDD
                                  ? renderPointDoubleDouble(
                                        options,
                                        ox === 0
                                            ? xDD
                                            : ddAdd(xDD, ddMul(dd(ox), viewport.unitsPerPixel)),
                                        oy === 0
                                            ? yDD
                                            : ddSub(yDD, ddMul(dd(oy), viewport.unitsPerPixel)),
                                    )
                                  : renderPointNumber(
                                        options,
                                        x + ox * numberViewport.unitsPerPixel,
                                        y - oy * numberViewport.unitsPerPixel,
                                    ));
                        const color = fractalColor(result.status, result.smoothIteration);
                        if (offsets.length === 1) {
                            r = Math.round(color[0]);
                            g = Math.round(color[1]);
                            b = Math.round(color[2]);
                        } else {
                            r += toLinear(color[0]);
                            g += toLinear(color[1]);
                            b += toLinear(color[2]);
                        }
                    }
                    if (offsets.length > 1) {
                        r = toDisplayByte(r / offsets.length);
                        g = toDisplayByte(g / offsets.length);
                        b = toDisplayByte(b / offsets.length);
                    }
                    const offset = ((py - startY) * width + px) * 4;

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

        if (id === activeRenderId) post({ type: 'complete', id, ...(warning ? { warning } : {}) });
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

function post(message: FractalRenderWorkerResponse, transfer: Transferable[] = []): void {
    worker.postMessage(message, transfer);
}

function yieldToMessages(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
