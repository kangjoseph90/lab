import { describe, expect, it } from 'vitest';
import { iterateMandelbrotPoint } from '@lab/fractal';
import { dd } from '@lab/precision';
import { fractalViewport, panFractalViewport, scaleFractalViewportUnits } from '../viewport';
import { createTileOrbits, PerturbationOrbitFinder } from './perturbation-orbits';
import type { FractalConfig, FractalPrecision } from './renderer';

const mandelbrot: FractalConfig = { type: 'mandelbrot' };
const viewport = fractalViewport(-0.5, 0, 0.005);

describe('adaptive perturbation anchors', () => {
    it.each<FractalPrecision>(['number', 'double-double'])(
        'finds a bounded point between the original grid samples with %s precision',
        (precision) => {
            const view = fractalViewport(
                0.39530644728802145,
                -0.6678316550329327,
                0.004796996951014887,
            );
            // The original nine-point grid misses the bounded region in this tile.
            for (const x of [16, 32, 48]) {
                for (const y of [16, 32, 48]) {
                    expect(
                        iterateMandelbrotPoint(
                            view.centerX.hi + (x - 32) * view.unitsPerPixel.hi,
                            view.centerY.hi - (y - 32) * view.unitsPerPixel.hi,
                            256,
                        ).status,
                    ).toBe('escaped');
                }
            }
            const result = createTileOrbits(view, 64, 64, 256, precision, mandelbrot);
            expect(result.anchorCount).toBe(1);
            expect(result.evaluatedCandidates).toBeGreaterThan(5);
            expect(result.evaluatedCandidates).toBeLessThanOrEqual(9);
            const [x, y] = result.anchors;
            expect(
                iterateMandelbrotPoint(
                    view.centerX.hi + (x! - 32) * view.unitsPerPixel.hi,
                    view.centerY.hi - (y! - 32) * view.unitsPerPixel.hi,
                    256,
                ).status,
            ).toBe('bounded');
        },
    );

    it('bounds failed searches at nine trials per tile, including partial tiles', () => {
        const result = createTileOrbits(
            fractalViewport(3, 3, 0.005),
            65,
            65,
            256,
            'number',
            mandelbrot,
        );
        expect(result.anchorCount).toBe(0);
        expect(result.evaluatedCandidates).toBeLessThanOrEqual(4 * 9);
        expect([...result.anchors].filter((_, i) => i % 4 < 2)).toEqual(Array(8).fill(-1));
    });

    it('tests a one-pixel tile only once after clamping duplicate candidates', () => {
        const result = createTileOrbits(
            fractalViewport(3, 3, 0.005),
            1,
            1,
            256,
            'number',
            mandelbrot,
        );
        expect(result.evaluatedCandidates).toBe(1);
    });
});

describe('perturbation reference reuse', () => {
    it('does not repeat failed searches or borrowed-tile searches for an identical view', () => {
        const finder = new PerturbationOrbitFinder();
        const view = fractalViewport(0.5, 0, 0.02);
        const first = finder.createTileOrbits(view, 128, 64, 256, 'number', mandelbrot);
        const next = finder.createTileOrbits(view, 128, 64, 256, 'number', mandelbrot);
        expect(first.anchorCount).toBe(1);
        expect(next.evaluatedCandidates).toBe(0);
        expect(next.orbit).toBe(first.orbit);
        expect(next.anchors).toBe(first.anchors);
        const empty = fractalViewport(3, 3, 0.005);
        finder.createTileOrbits(empty, 128, 64, 256, 'number', mandelbrot);
        expect(
            finder.createTileOrbits(empty, 128, 64, 256, 'number', mandelbrot).evaluatedCandidates,
        ).toBe(0);
    });
    it('reuses the whole orbit without new trials for an unchanged frame', () => {
        const finder = new PerturbationOrbitFinder();
        const first = finder.createTileOrbits(viewport, 64, 64, 256, 'number', mandelbrot);
        const next = finder.createTileOrbits(viewport, 64, 64, 256, 'number', mandelbrot);
        expect(first.evaluatedCandidates).toBe(1);
        expect(next.reusedAnchors).toBe(1);
        expect(next.evaluatedCandidates).toBe(0);
        expect(next.orbit).toEqual(first.orbit);
        expect(next.anchors).toEqual(first.anchors);
    });

    it('keeps the reference coordinate and remaps its pixel position after pan and zoom', () => {
        const finder = new PerturbationOrbitFinder();
        const first = finder.createTileOrbits(viewport, 64, 64, 256, 'number', mandelbrot);
        const moved = scaleFractalViewportUnits(panFractalViewport(viewport, 4, -3), 0.5);
        const next = finder.createTileOrbits(moved, 64, 64, 256, 'number', mandelbrot);
        expect(next.reusedAnchors).toBe(1);
        expect(next.evaluatedCandidates).toBe(0);
        expect(next.anchors[0]).toBeCloseTo(40);
        expect(next.anchors[1]).toBeCloseTo(26);
        expect(next.orbit).toEqual(first.orbit);
    });

    it('preserves the low part of deep-zoom coordinates when projecting cached references', () => {
        const finder = new PerturbationOrbitFinder();
        const deep = { centerX: { hi: -0.5, lo: 1e-20 }, centerY: dd(0), unitsPerPixel: dd(1e-23) };
        finder.createTileOrbits(deep, 64, 64, 256, 'double-double', mandelbrot);
        const next = finder.createTileOrbits(
            panFractalViewport(deep, 2.25, 0),
            64,
            64,
            256,
            'double-double',
            mandelbrot,
        );
        expect(next.reusedAnchors).toBe(1);
        expect(next.evaluatedCandidates).toBe(0);
        expect(next.anchors[0]).toBeCloseTo(34.25);
    });

    it('drops off-screen references so an unrelated view still reports no anchors', () => {
        const finder = new PerturbationOrbitFinder();
        finder.createTileOrbits(viewport, 64, 64, 256, 'number', mandelbrot);
        const next = finder.createTileOrbits(
            fractalViewport(3, 3, 0.005),
            64,
            64,
            256,
            'number',
            mandelbrot,
        );
        expect(next.reusedAnchors).toBe(0);
        expect(next.anchorCount).toBe(0);
        // Only the preceding frame is retained, keeping cache memory bounded.
        expect(
            finder.createTileOrbits(viewport, 64, 64, 256, 'number', mandelbrot).reusedAnchors,
        ).toBe(0);
    });

    it.each([
        { iterations: 512, precision: 'number', fractal: mandelbrot },
        { iterations: 256, precision: 'double-double', fractal: mandelbrot },
        { iterations: 256, precision: 'number', fractal: { type: 'julia', c: { re: 0, im: 0 } } },
    ] as { iterations: number; precision: FractalPrecision; fractal: FractalConfig }[])(
        'invalidates references when the render configuration changes: %j',
        ({ iterations, precision, fractal }) => {
            const finder = new PerturbationOrbitFinder();
            finder.createTileOrbits(viewport, 64, 64, 256, 'number', mandelbrot);
            const next = finder.createTileOrbits(viewport, 64, 64, iterations, precision, fractal);
            expect(next.reusedAnchors).toBe(0);
            expect(next.evaluatedCandidates).toBeGreaterThan(0);
            expect(next.orbit.length).toBe((iterations + 1) * 4);
        },
    );

    it.each([
        { re: 0.1, im: 0 },
        { re: 0, im: 0.1 },
    ])('invalidates Julia references when c changes to %j', (c) => {
        const finder = new PerturbationOrbitFinder();
        finder.createTileOrbits(viewport, 64, 64, 256, 'number', {
            type: 'julia',
            c: { re: 0, im: 0 },
        });
        const next = finder.createTileOrbits(viewport, 64, 64, 256, 'number', { type: 'julia', c });
        expect(next.reusedAnchors).toBe(0);
        expect(next.evaluatedCandidates).toBeGreaterThan(0);
    });

    it('projects references into resized and newly assigned tiles', () => {
        const finder = new PerturbationOrbitFinder();
        finder.createTileOrbits(viewport, 64, 64, 256, 'number', mandelbrot);
        const next = finder.createTileOrbits(viewport, 128, 64, 256, 'number', mandelbrot);
        expect(next.reusedAnchors).toBe(1);
        expect(next.anchors[4]).toBeCloseTo(64);
    });
});
