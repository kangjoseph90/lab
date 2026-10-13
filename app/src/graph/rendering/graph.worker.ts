/// <reference lib="webworker" />

import { compileEquationExpr } from '../equation';
import type { CompiledEquation } from '../equation';
import { getCoverage, INEQUALITY_OPACITY } from './render-coverage';
import type { RenderWorkerRequest, RenderWorkerResponse } from './render-protocol';
import { classifyTile } from './tile-classification';
import { blendPixel } from './layers';
import type { GraphColor } from './layers';

const worker = self as DedicatedWorkerGlobalScope;
const background: readonly [number, number, number] = [247, 247, 244];
const tileSize = 8;
type CompiledLayer = { equation: CompiledEquation; color?: GraphColor };
let layers: CompiledLayer[] | undefined;
const equations = new Map<string, CompiledEquation>();
let equationError: string | undefined;
let activeRenderId = 0;

worker.onmessage = (event: MessageEvent<RenderWorkerRequest>) => {
    const message = event.data;

    if (message.type === 'set-equation' || message.type === 'set-layers') {
        activeRenderId = 0;
        try {
            const entries =
                message.type === 'set-equation' ? [{ equation: message.equation }] : message.layers;
            layers = entries.map((entry) => {
                const key = JSON.stringify(entry.equation);
                let compiled = equations.get(key);
                if (!compiled) {
                    compiled = compileEquationExpr(entry.equation);
                    if (equations.size >= 32) equations.delete(equations.keys().next().value!);
                    equations.set(key, compiled);
                }
                return 'color' in entry
                    ? { equation: compiled, color: entry.color }
                    : { equation: compiled };
            });
            equationError = undefined;
        } catch (cause) {
            layers = undefined;
            equationError = cause instanceof Error ? cause.message : String(cause);
        }
        return;
    }

    if (message.type === 'cancel') {
        activeRenderId = message.id;
        return;
    }

    activeRenderId = message.id;
    void render(message, layers);
};

async function render(
    request: Extract<RenderWorkerRequest, { type: 'render' }>,
    compiledLayers: CompiledLayer[] | undefined,
): Promise<void> {
    try {
        if (!compiledLayers) throw new Error(equationError ?? 'No equation has been compiled.');

        const { id, width, height, viewport, options } = request;
        const threshold = options.lineWidth * viewport.unitsPerPixel;
        const chunkHeight = 24;
        const backgroundWord = rgbaWord(...background, 255);

        for (let startY = 0; startY < height; startY += chunkHeight) {
            if (id !== activeRenderId) return;

            const rows = Math.min(chunkHeight, height - startY);
            const pixels = new Uint8ClampedArray(width * rows * 4);
            const words = new Uint32Array(pixels.buffer);
            words.fill(backgroundWord);

            for (const layer of compiledLayers) {
                const compiled = layer.equation;
                const color = layer.color ?? options.color;
                for (let tileY = startY; tileY < startY + rows; tileY += tileSize) {
                    const tileHeight = Math.min(tileSize, startY + rows - tileY);

                    for (let tileX = 0; tileX < width; tileX += tileSize) {
                        const tileWidth = Math.min(tileSize, width - tileX);
                        const samples = sampleTile(
                            compiled,
                            tileX,
                            tileY,
                            tileWidth,
                            tileHeight,
                            width,
                            height,
                            viewport,
                        );
                        const gradients = sampleTileGradients(
                            compiled,
                            tileX,
                            tileY,
                            tileWidth,
                            tileHeight,
                            width,
                            height,
                            viewport,
                        );
                        const sampleRadius =
                            Math.hypot((tileWidth - 1) / 4, (tileHeight - 1) / 4) *
                            viewport.unitsPerPixel;

                        const classification = classifyTile(
                            compiled.relation,
                            samples,
                            gradients,
                            sampleRadius,
                        );

                        if (classification === 'outside') continue;

                        if (classification === 'inside') {
                            for (let py = tileY; py < tileY + tileHeight; py += 1) {
                                for (let px = tileX; px < tileX + tileWidth; px++) {
                                    blendPixel(
                                        pixels,
                                        ((py - startY) * width + px) * 4,
                                        color,
                                        INEQUALITY_OPACITY,
                                    );
                                }
                            }
                            continue;
                        }

                        for (let py = tileY; py < tileY + tileHeight; py += 1) {
                            const y = viewport.centerY - (py - height / 2) * viewport.unitsPerPixel;

                            for (let px = tileX; px < tileX + tileWidth; px += 1) {
                                const x =
                                    viewport.centerX + (px - width / 2) * viewport.unitsPerPixel;
                                const coverage = getCoverage(
                                    compiled,
                                    x,
                                    y,
                                    threshold,
                                    viewport.unitsPerPixel,
                                );
                                const offset = ((py - startY) * width + px) * 4;

                                if (coverage > 0) blendPixel(pixels, offset, color, coverage);
                            }
                        }
                    }
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

function sampleTile(
    compiled: CompiledEquation,
    tileX: number,
    tileY: number,
    tileWidth: number,
    tileHeight: number,
    width: number,
    height: number,
    viewport: Extract<RenderWorkerRequest, { type: 'render' }>['viewport'],
): number[] {
    const xs = [tileX, tileX + Math.floor((tileWidth - 1) / 2), tileX + tileWidth - 1];
    const ys = [tileY, tileY + Math.floor((tileHeight - 1) / 2), tileY + tileHeight - 1];
    const samples: number[] = [];

    for (const py of ys) {
        const y = viewport.centerY - (py - height / 2) * viewport.unitsPerPixel;

        for (const px of xs) {
            const x = viewport.centerX + (px - width / 2) * viewport.unitsPerPixel;
            samples.push(compiled.value(x, y));
        }
    }

    return samples;
}

function sampleTileGradients(
    compiled: CompiledEquation,
    tileX: number,
    tileY: number,
    tileWidth: number,
    tileHeight: number,
    width: number,
    height: number,
    viewport: Extract<RenderWorkerRequest, { type: 'render' }>['viewport'],
): number[] {
    const xs = [tileX, tileX + Math.floor((tileWidth - 1) / 2), tileX + tileWidth - 1];
    const ys = [tileY, tileY + Math.floor((tileHeight - 1) / 2), tileY + tileHeight - 1];
    const gradients: number[] = [];

    for (const py of ys) {
        const y = viewport.centerY - (py - height / 2) * viewport.unitsPerPixel;

        for (const px of xs) {
            const x = viewport.centerX + (px - width / 2) * viewport.unitsPerPixel;
            gradients.push(Math.hypot(compiled.dx(x, y), compiled.dy(x, y)));
        }
    }

    return gradients;
}

function post(message: RenderWorkerResponse, transfer: Transferable[] = []): void {
    worker.postMessage(message, transfer);
}

function rgbaWord(red: number, green: number, blue: number, alpha: number): number {
    const bytes = new Uint8ClampedArray([red, green, blue, alpha]);
    return new Uint32Array(bytes.buffer)[0]!;
}

function yieldToMessages(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
