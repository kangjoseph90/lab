import { afterEach, describe, expect, it, vi } from 'vitest';
import { fractalViewport } from '../viewport';
import type { FractalRenderWorkerRequest, FractalRenderWorkerResponse } from './render-protocol';
import type { RenderOptions } from './renderer';
import { iterateMandelbrotPoint } from '@lab/fractal';
import { sampleOffsets, fractalColor, toLinear, toDisplayByte } from './antialiasing';
import { DEEP_BOUNDARY_VIEW, DEEP_BOUNDARY_SAMPLES } from './deep-zoom.fixture';

const options: RenderOptions = {
    fractal: { type: 'mandelbrot' },
    backend: 'cpu',
    precision: 'double-double',
    perturbation: true,
    maxIterations: 256,
};
const request = (id: number): Extract<FractalRenderWorkerRequest, { type: 'render' }> => ({
    type: 'render',
    id,
    width: 32,
    height: 24,
    viewport: fractalViewport(-0.5, 0, 0.005),
    options,
});

async function worker() {
    const messages: FractalRenderWorkerResponse[] = [];
    const scope = {
        onmessage: undefined as unknown as (event: { data: FractalRenderWorkerRequest }) => void,
        postMessage: (message: FractalRenderWorkerResponse) => messages.push(message),
    };
    vi.stubGlobal('self', scope);
    vi.resetModules();
    await import('./fractal.worker');
    return { messages, send: (data: FractalRenderWorkerRequest) => scope.onmessage({ data }) };
}
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('CPU perturbation worker', () => {
    it.each([
        { maxIterations: 64, glitch: false },
        { maxIterations: 64, glitch: true },
        { maxIterations: 512, glitch: false },
    ])(
        'matches the independent deep-zoom image ($maxIterations iterations, glitch: $glitch)',
        async ({ maxIterations, glitch }) => {
            const state = await worker();
            if (glitch) {
                const module = await import('./cpu-perturbation');
                vi.spyOn(module, 'iteratePerturbedPoint').mockReturnValue(undefined);
            }
            state.send({
                ...request(1),
                width: 128,
                height: 96,
                viewport: DEEP_BOUNDARY_VIEW,
                options: { ...options, maxIterations },
            });
            await vi.waitFor(() => expect(state.messages.at(-1)?.type).toBe('complete'), {
                timeout: 5000,
            });
            for (const [px, py, iterations, smooth] of DEEP_BOUNDARY_SAMPLES) {
                const chunk = state.messages.find((m) => m.type === 'chunk' && m.y === py);
                if (!chunk || chunk.type !== 'chunk') throw new Error('Expected deep-zoom row');
                const rgb = fractalColor(
                    iterations > maxIterations ? 'bounded' : 'escaped',
                    smooth,
                ).map(Math.round);
                const pixels = new Uint8ClampedArray(chunk.pixels);
                expect([...pixels.slice(px * 4, px * 4 + 4)]).toEqual([...rgb, 255]);
            }
        },
    );
    it.each([4, 9] as const)(
        'averages actual subpixel colors for %s samples across a boundary',
        async (antialiasing) => {
            const state = await worker();
            const scale = 0.08;
            state.send({
                ...request(1),
                width: 1,
                height: 1,
                viewport: fractalViewport(-1 + scale / 2, 0.25 - scale / 2, scale),
                options: {
                    ...options,
                    precision: 'number',
                    perturbation: false,
                    maxIterations: 64,
                    antialiasing,
                },
            });
            await vi.waitFor(() => expect(state.messages.at(-1)?.type).toBe('complete'));
            const colors = sampleOffsets(antialiasing).map(([x, y]) => {
                const result = iterateMandelbrotPoint(-1 + x * scale, 0.25 - y * scale, 64);
                return fractalColor(result.status, result.smoothIteration);
            });
            const bounded = colors.filter((c) => c[0] === 18 && c[1] === 20 && c[2] === 22).length;
            expect(bounded).toBeGreaterThan(0);
            expect(bounded).toBeLessThan(antialiasing);
            const expected = [0, 1, 2].map((c) =>
                toDisplayByte(
                    colors.reduce((sum, rgb) => sum + toLinear(rgb[c]!), 0) / antialiasing,
                ),
            );
            const chunk = state.messages.find((m) => m.type === 'chunk');
            if (!chunk || chunk.type !== 'chunk') throw new Error('Expected pixels');
            expect([...new Uint8ClampedArray(chunk.pixels)]).toEqual([...expected, 255]);
        },
    );

    it('keeps AA samples at image edges and tile boundaries on the base pixel reference', async () => {
        const state = await worker();
        const module = await import('./cpu-perturbation');
        const perturb = vi.spyOn(module, 'iteratePerturbedPoint');
        state.send({
            ...request(1),
            width: 65,
            height: 2,
            options: { ...options, antialiasing: 9 },
        });
        await vi.waitFor(() => expect(state.messages.at(-1)?.type).toBe('complete'));
        expect(perturb).toHaveBeenCalledTimes(65 * 2 * 9);
        expect(perturb.mock.results.every((r) => r.value?.status === 'bounded')).toBe(true);
        expect(perturb.mock.calls[0]![1]).toBeLessThan(0);
        expect(perturb.mock.calls[0]![6]).toBe(0);
        expect(perturb.mock.calls[64 * 9]![1]).toBeLessThan(64);
        expect(perturb.mock.calls[64 * 9]![6]).toBe(1);
    });
    it.each(['number', 'double-double'] as const)(
        'renders with perturbation and preserves the direct %s image on an interior view',
        async (precision) => {
            const state = await worker();
            const module = await import('./cpu-perturbation');
            const perturb = vi.spyOn(module, 'iteratePerturbedPoint');
            const renderRequest = { ...request(1), options: { ...options, precision } };
            state.send(renderRequest);
            await vi.waitFor(() => expect(state.messages.at(-1)?.type).toBe('complete'));
            const first = state.messages.find((m) => m.type === 'chunk');
            if (!first || first.type !== 'chunk') throw new Error('Expected pixels');
            expect(perturb).toHaveBeenCalledTimes(32 * 24);
            expect(perturb.mock.results.some((r) => r.value !== undefined)).toBe(true);
            expect(state.messages.at(-1)).toEqual({ type: 'complete', id: 1 });
            perturb.mockClear();
            state.send({
                ...renderRequest,
                id: 2,
                options: { ...renderRequest.options, perturbation: false },
            });
            await vi.waitFor(() =>
                expect(state.messages.at(-1)).toEqual({ type: 'complete', id: 2 }),
            );
            const direct = state.messages.find((m) => m.type === 'chunk' && m.id === 2);
            if (!direct || direct.type !== 'chunk') throw new Error('Expected pixels');
            expect(new Uint8ClampedArray(first.pixels)).toEqual(
                new Uint8ClampedArray(direct.pixels),
            );
            expect(perturb).not.toHaveBeenCalled();
        },
    );

    it('warns and falls back if reference generation throws', async () => {
        const state = await worker();
        const { PerturbationOrbitFinder } = await import('./perturbation-orbits');
        vi.spyOn(PerturbationOrbitFinder.prototype, 'createTileOrbits').mockImplementation(() => {
            throw new Error('Reference unavailable');
        });
        state.send(request(1));
        await vi.waitFor(() => expect(state.messages.at(-1)?.type).toBe('complete'));
        expect(state.messages.at(-1)).toEqual({
            type: 'complete',
            id: 1,
            warning: 'perturbation-failed',
        });
        expect(state.messages.some((m) => m.type === 'chunk')).toBe(true);
    });

    it('warns and produces direct pixels if there is no pivot', async () => {
        const state = await worker();
        const empty = { ...request(1), viewport: fractalViewport(3, 3, 0.005) };
        state.send(empty);
        await vi.waitFor(() => expect(state.messages.at(-1)?.type).toBe('complete'));
        expect(state.messages.at(-1)).toEqual({
            type: 'complete',
            id: 1,
            warning: 'perturbation-anchor-unavailable',
        });
        const first = state.messages.find((m) => m.type === 'chunk');
        state.send({ ...empty, id: 2, options: { ...options, perturbation: false } });
        await vi.waitFor(() => expect(state.messages.at(-1)).toEqual({ type: 'complete', id: 2 }));
        const direct = state.messages.find((m) => m.type === 'chunk' && m.id === 2);
        if (!first || first.type !== 'chunk' || !direct || direct.type !== 'chunk')
            throw new Error('Expected pixels');
        expect(new Uint8ClampedArray(first.pixels)).toEqual(new Uint8ClampedArray(direct.pixels));
    });

    it('cancels before drawing after reference generation, then handles the next render', async () => {
        vi.useFakeTimers();
        const state = await worker();
        state.send(request(1));
        state.send({ type: 'cancel', id: 2 });
        await vi.runAllTimersAsync();
        expect(state.messages).toHaveLength(0);
        state.send(request(3));
        await vi.runAllTimersAsync();
        expect(state.messages.at(-1)).toEqual({ type: 'complete', id: 3 });
    });
});
