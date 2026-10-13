import { afterEach, describe, expect, it, vi } from 'vitest';
import { RenderRefinement } from './render-refinement';

afterEach(() => vi.useRealTimers());

describe('render refinement', () => {
    it('renders the selected quality once for ordinary setting changes', async () => {
        const state = new RenderRefinement();
        const render = vi.fn(async () => 'done');
        expect(await state.run(render, false)).toBe('done');
        expect(render).toHaveBeenCalledExactlyOnceWith(true);
    });

    it('shows a preview, then refines after 150 ms of idle', async () => {
        vi.useFakeTimers();
        const state = new RenderRefinement();
        const render = vi.fn(async (refined: boolean) => (refined ? 'quality' : 'preview'));
        const result = state.run(render, true);
        await vi.advanceTimersByTimeAsync(149);
        expect(render.mock.calls).toEqual([[false]]);
        await vi.advanceTimersByTimeAsync(1);
        expect(await result).toBe('quality');
        expect(render.mock.calls).toEqual([[false], [true]]);
    });

    it('does not interrupt a slow preview when the idle timer expires', async () => {
        vi.useFakeTimers();
        const state = new RenderRefinement();
        let finish!: () => void;
        const render = vi.fn((refined: boolean) =>
            refined
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                      finish = resolve;
                  }),
        );
        const result = state.run(render, true);
        await vi.advanceTimersByTimeAsync(500);
        expect(render.mock.calls).toEqual([[false]]);
        finish();
        await result;
        expect(render.mock.calls).toEqual([[false], [true]]);
    });

    it('cancels stale refinement when new input or dragging replaces the view', async () => {
        vi.useFakeTimers();
        const state = new RenderRefinement();
        const old = vi.fn(async () => {});
        const latest = vi.fn(async () => {});
        const first = state.run(old, true);
        await vi.advanceTimersByTimeAsync(100);
        const second = state.run(latest, true);
        await first;
        await vi.advanceTimersByTimeAsync(150);
        await second;
        expect(old.mock.calls).toEqual([[false]]);
        expect(latest.mock.calls).toEqual([[false], [true]]);
        const dragged = state.run(old, true);
        state.cancel();
        await dragged;
        await vi.runAllTimersAsync();
        expect(old.mock.calls).toEqual([[false]]);
    });

    it('surfaces preview errors without launching refinement, and can render again', async () => {
        vi.useFakeTimers();
        const state = new RenderRefinement();
        const render = vi.fn(async () => {
            throw new Error('GPU unavailable');
        });
        const rejected = expect(state.run(render, true)).rejects.toThrow('GPU unavailable');
        await vi.runAllTimersAsync();
        await rejected;
        expect(render).toHaveBeenCalledTimes(1);
        expect(await state.run(async () => 'recovered', false)).toBe('recovered');
    });
});
