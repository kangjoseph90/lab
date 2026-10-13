import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEquation } from '../equation';
import type { RenderWorkerRequest, RenderWorkerResponse } from './render-protocol';

afterEach(() => vi.unstubAllGlobals());

async function worker() {
    const messages: RenderWorkerResponse[] = [];
    const scope = {
        onmessage: undefined as unknown as (event: { data: RenderWorkerRequest }) => void,
        postMessage: (message: RenderWorkerResponse) => messages.push(message),
    };
    vi.stubGlobal('self', scope);
    vi.resetModules();
    await import('./graph.worker');
    return { messages, send: (data: RenderWorkerRequest) => scope.onmessage({ data }) };
}

describe('multi-equation CPU worker', () => {
    it('preserves earlier curves and blends overlapping inequality fills in order', async () => {
        const state = await worker();
        state.send({
            type: 'set-layers',
            layers: [
                { equation: parseEquation('x < 0'), color: [20, 60, 200] },
                { equation: parseEquation('y < 0'), color: [220, 30, 40] },
            ],
        });
        state.send({
            type: 'render',
            id: 1,
            width: 9,
            height: 7,
            viewport: { centerX: 0, centerY: 0, unitsPerPixel: 0.01 },
            options: { lineWidth: 1.35, color: [0, 0, 0] },
        });
        await vi.waitFor(() => expect(state.messages.at(-1)?.type).toBe('complete'));
        const chunk = state.messages.find((message) => message.type === 'chunk');
        if (!chunk || chunk.type !== 'chunk') throw new Error('Expected pixels');
        const pixels = new Uint8ClampedArray(chunk.pixels);
        const pixel = (x: number, y: number) => [
            ...pixels.slice((y * 9 + x) * 4, (y * 9 + x) * 4 + 4),
        ];
        expect(pixel(2, 1)).toEqual([202, 210, 235, 255]);
        expect(pixel(2, 5)).toEqual([206, 174, 196, 255]);
        expect(pixel(7, 5)).toEqual([242, 204, 203, 255]);
        expect(pixel(7, 1)).toEqual([247, 247, 244, 255]);
    });

    it('can render a blank scene', async () => {
        const state = await worker();
        state.send({ type: 'set-layers', layers: [] });
        state.send({
            type: 'render',
            id: 1,
            width: 3,
            height: 2,
            viewport: { centerX: 0, centerY: 0, unitsPerPixel: 0.01 },
            options: { lineWidth: 1.35, color: [0, 0, 0] },
        });
        await vi.waitFor(() => expect(state.messages.at(-1)?.type).toBe('complete'));
        const chunk = state.messages.find((message) => message.type === 'chunk');
        if (!chunk || chunk.type !== 'chunk') throw new Error('Expected pixels');
        expect([...new Uint8ClampedArray(chunk.pixels)]).toEqual(
            Array.from({ length: 6 }, () => [247, 247, 244, 255]).flat(),
        );
    });
});
