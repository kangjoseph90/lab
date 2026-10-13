import { describe, expect, it } from 'vitest';
import { ddComplex, iterateMandelbrotPointDD, iterateJuliaPointDD } from '@lab/fractal';
import { dd, ddAdd, ddMul, ddSub } from '@lab/precision';
import { fractalViewport } from '../viewport';
import { iteratePerturbedPoint } from './cpu-perturbation';
import { PerturbationOrbitFinder } from './perturbation-orbits';
import type { FractalConfig, FractalPrecision } from './renderer';

const mandelbrot: FractalConfig = { type: 'mandelbrot' };

describe('CPU perturbation', () => {
    it('stores CPU references and screen anchors in Float64 without truncating DD low parts', () => {
        const view = { centerX: { hi: -0.5, lo: 1e-24 }, centerY: dd(0), unitsPerPixel: dd(1e-25) };
        const refs = new PerturbationOrbitFinder('cpu').createTileOrbits(
            view,
            64,
            64,
            256,
            'double-double',
            mandelbrot,
        );
        expect(refs.orbit).toBeInstanceOf(Float64Array);
        expect(refs.anchors).toBeInstanceOf(Float64Array);
        expect(refs.orbit[4]).toBe(-0.5);
        expect(refs.orbit[6]).toBe(1e-24);
    });

    it.each<FractalPrecision>(['number', 'double-double'])(
        'agrees with direct DD classification around bounded and escaping points (%s)',
        (precision) => {
            const view = fractalViewport(-0.5, 0, 0.005);
            const refs = new PerturbationOrbitFinder('cpu').createTileOrbits(
                view,
                64,
                64,
                256,
                precision,
                mandelbrot,
            );
            let used = 0;
            for (const py of [12, 24, 32, 40, 52])
                for (const px of [8, 16, 24, 32, 40, 48, 56]) {
                    const direct = iterateMandelbrotPointDD(
                        ddComplex(
                            ddAdd(view.centerX, ddMul(dd(px - 32), view.unitsPerPixel)),
                            ddSub(view.centerY, ddMul(dd(py - 32), view.unitsPerPixel)),
                        ),
                        256,
                    );
                    const result = iteratePerturbedPoint(
                        refs,
                        px,
                        py,
                        view.unitsPerPixel.hi,
                        256,
                        mandelbrot,
                    );
                    if (!result) continue;
                    used++;
                    expect(result.status).toBe(direct.status);
                    expect(result.iterations).toBe(direct.iterations);
                    if (direct.smoothIteration !== undefined)
                        expect(result.smoothIteration).toBeCloseTo(direct.smoothIteration, 7);
                }
            expect(used).toBe(35);
            const edgeView = fractalViewport(-2, 0, 0.005);
            const edge = new PerturbationOrbitFinder('cpu').createTileOrbits(
                edgeView,
                64,
                64,
                256,
                precision,
                mandelbrot,
            );
            const escaping = iteratePerturbedPoint(edge, 22, 32, 0.005, 256, mandelbrot);
            expect(escaping?.status).toBe('escaped');
            expect(escaping?.iterations).toBe(
                iterateMandelbrotPointDD(ddComplex(-2.05, 0), 256).iterations,
            );
        },
    );

    it('asks for direct calculation on cancellation glitches and escape-radius ambiguity', () => {
        const view = fractalViewport(-0.5, 0, 0.025);
        const finder = new PerturbationOrbitFinder('cpu');
        const refs = finder.createTileOrbits(view, 64, 64, 256, 'double-double', mandelbrot);
        expect(iteratePerturbedPoint(refs, 52, 32, 0.025, 256, mandelbrot)).toBeUndefined();
        const edge = finder.createTileOrbits(
            fractalViewport(-2, 0, 1e-20),
            64,
            64,
            256,
            'double-double',
            mandelbrot,
        );
        expect(iteratePerturbedPoint(edge, 31, 32, 1e-20, 256, mandelbrot)).toBeUndefined();
    });

    it('matches direct DD results on a deep boundary view, including guarded pixels', () => {
        const view = fractalViewport(-0.743643887037151, 0.13182590420533, 1e-7);
        const refs = new PerturbationOrbitFinder('cpu').createTileOrbits(
            view,
            128,
            96,
            4096,
            'double-double',
            mandelbrot,
        );
        expect(refs.anchorCount).toBeGreaterThan(0);
        let perturbed = 0;
        for (const py of [16, 32, 48, 64, 80])
            for (const px of [16, 32, 48, 64, 80, 96, 112]) {
                const direct = iterateMandelbrotPointDD(
                    ddComplex(
                        ddAdd(view.centerX, ddMul(dd(px - 64), view.unitsPerPixel)),
                        ddSub(view.centerY, ddMul(dd(py - 48), view.unitsPerPixel)),
                    ),
                    4096,
                );
                const result = iteratePerturbedPoint(refs, px, py, 1e-7, 4096, mandelbrot);
                if (!result) continue;
                perturbed++;
                expect(result.status).toBe(direct.status);
                expect(result.iterations).toBe(direct.iterations);
                if (direct.smoothIteration !== undefined)
                    expect(result.smoothIteration).toBeCloseTo(direct.smoothIteration, 5);
            }
        expect(perturbed).toBeGreaterThan(0);
    });

    it('computes Julia deltas in the initial z and recomputes pixels that outlive their reference', () => {
        const julia: FractalConfig = { type: 'julia', c: { re: 0.25, im: 0 } };
        const view = fractalViewport(0.55, 0, 0.01);
        const refs = new PerturbationOrbitFinder('cpu').createTileOrbits(
            view,
            64,
            64,
            128,
            'double-double',
            julia,
        );
        const center = iteratePerturbedPoint(refs, 32, 32, 0.01, 128, julia);
        const direct = iterateJuliaPointDD(ddComplex(0.55, 0), ddComplex(0.25, 0), 128);
        expect(center?.status).toBe(direct.status);
        expect(center?.iterations).toBe(direct.iterations);
        expect(iteratePerturbedPoint(refs, 22, 32, 0.01, 128, julia)).toBeUndefined();
        expect(iterateJuliaPointDD(ddComplex(0.45, 0), ddComplex(0.25, 0), 128).status).toBe(
            'bounded',
        );
    });
});
