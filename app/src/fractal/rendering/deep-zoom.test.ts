import { describe, expect, it } from 'vitest';
import { dd } from '@lab/precision';
import { deepZoomArithmetic, DeepZoomArithmetic } from './deep-zoom';
import { DEEP_BOUNDARY_SAMPLES, DEEP_BOUNDARY_VIEW } from './deep-zoom.fixture';
import { fractalViewport, panFractalViewport } from '../viewport';
import { PerturbationOrbitFinder } from './perturbation-orbits';
import { iteratePerturbedPoint } from './cpu-perturbation';

const mandelbrot = { type: 'mandelbrot' } as const;
describe('deep CPU perturbation precision', () => {
    it('keeps ordinary zoom and Number on the existing fast path', () => {
        expect(
            deepZoomArithmetic(fractalViewport(-0.5, 0, 0.005), 'double-double'),
        ).toBeUndefined();
        expect(deepZoomArithmetic(DEEP_BOUNDARY_VIEW, 'number')).toBeUndefined();
        expect(deepZoomArithmetic(DEEP_BOUNDARY_VIEW, 'double-double')?.bits).toBeGreaterThan(180);
        expect(
            deepZoomArithmetic(fractalViewport(-0.5, 0, 1e-60), 'double-double')!.bits,
        ).toBeGreaterThan(270);
    });

    it('matches independent 110-digit escape results at 4.25e-33 per pixel', () => {
        const arithmetic = new DeepZoomArithmetic(DEEP_BOUNDARY_VIEW);
        for (const [px, py, iterations, smooth] of DEEP_BOUNDARY_SAMPLES) {
            const result = arithmetic.iterate(arithmetic.point(px, py, 128, 96), 512, mandelbrot);
            expect(result.status).toBe('escaped');
            expect(result.iterations).toBe(iterations);
            expect(result.smoothIteration).toBeCloseTo(smooth, 10);
        }
    });

    it('uses precise references and screen anchors instead of rounding each sample to DD', () => {
        const refs = new PerturbationOrbitFinder('cpu').createTileOrbits(
            DEEP_BOUNDARY_VIEW,
            128,
            96,
            64,
            'double-double',
            mandelbrot,
        );
        expect(refs.anchorCount).toBe(4);
        let used = 0;
        for (const [px, py, iterations, smooth] of DEEP_BOUNDARY_SAMPLES) {
            const result = iteratePerturbedPoint(refs, px, py, 4.25e-33, 64, mandelbrot);
            expect(result).toBeDefined();
            used++;
            expect(result!.status).toBe(iterations > 64 ? 'bounded' : 'escaped');
            expect(result!.iterations).toBe(Math.min(iterations, 64));
            if (iterations <= 64) expect(result!.smoothIteration).toBeCloseTo(smooth, 7);
        }
        expect(used).toBe(DEEP_BOUNDARY_SAMPLES.length);
    });

    it('preserves subpixel anchors when panning and invalidates references if precision grows', () => {
        const arithmetic = new DeepZoomArithmetic(DEEP_BOUNDARY_VIEW);
        for (const [x, y] of [
            [32.25, 16.5],
            [64.25, 48.5],
        ]) {
            const point = arithmetic.point(x!, y!, 128, 96);
            expect(arithmetic.project(point, 128, 96)).toEqual({ pixelX: x, pixelY: y });
        }
        const finder = new PerturbationOrbitFinder('cpu');
        finder.createTileOrbits(DEEP_BOUNDARY_VIEW, 128, 96, 64, 'double-double', mandelbrot);
        const moved = panFractalViewport(DEEP_BOUNDARY_VIEW, 1, 0);
        const cached = finder.createTileOrbits(moved, 128, 96, 64, 'double-double', mandelbrot);
        expect(cached.reusedAnchors).toBeGreaterThan(0);
        const fresh = new PerturbationOrbitFinder('cpu').createTileOrbits(
            moved,
            128,
            96,
            64,
            'double-double',
            mandelbrot,
        );
        for (const [px, py] of DEEP_BOUNDARY_SAMPLES) {
            const a = iteratePerturbedPoint(cached, px, py, 4.25e-33, 64, mandelbrot);
            const b = iteratePerturbedPoint(fresh, px, py, 4.25e-33, 64, mandelbrot);
            expect(a?.status).toBe(b?.status);
        }
        const finer = finder.createTileOrbits(
            { ...moved, unitsPerPixel: dd(1e-50) },
            128,
            96,
            64,
            'double-double',
            mandelbrot,
        );
        expect(finer.reusedAnchors).toBe(0);
    });

    it('retains Julia initial coordinates and subnormal scales in fixed-point conversion', () => {
        const view = fractalViewport(2, 0, 1e-33);
        const arithmetic = new DeepZoomArithmetic(view);
        const julia = { type: 'julia', c: { re: 0, im: 0 } } as const;
        expect(arithmetic.iterate(arithmetic.point(0, 1, 2, 2), 16, julia).iterations).toBe(1);
        expect(arithmetic.iterate(arithmetic.point(2, 1, 2, 2), 16, julia).iterations).toBe(0);
        const tiny = new DeepZoomArithmetic(fractalViewport(0, 0, Number.MIN_VALUE));
        expect(tiny.iterate(tiny.point(2, 1, 2, 2), 0, julia).zx).toBe(Number.MIN_VALUE);
    });
});
