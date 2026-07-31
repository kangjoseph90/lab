import { describe, expect, it } from 'vitest';
import { complex } from '@lab/math';
import {
    iterateComplexFractal,
    iterateJuliaPoint,
    iterateMandelbrotPoint,
    julia,
    mandelbrot,
    mandelbrotStep,
} from '../src/index.js';

describe('complex fractals', () => {
    it('keeps points in the main Mandelbrot body bounded for the requested iteration budget', () => {
        expect(iterateComplexFractal(mandelbrot, complex(0), { maxIterations: 100 }).status).toBe(
            'bounded',
        );
        expect(iterateComplexFractal(mandelbrot, complex(-1), { maxIterations: 100 }).status).toBe(
            'bounded',
        );
    });

    it('escapes points outside the Mandelbrot set', () => {
        const result = iterateComplexFractal(mandelbrot, complex(2), { maxIterations: 100 });

        expect(result.status).toBe('escaped');
        expect(result.iterations).toBeLessThan(5);
        expect(result.smoothIteration).toBeTypeOf('number');
    });

    it('exposes the Mandelbrot step z^2 + c', () => {
        expect(mandelbrotStep(complex(1, 2), complex(-0.5, 0.25))).toEqual(complex(-3.5, 4.25));
    });

    it('uses the sample point as z0 for Julia sets', () => {
        const result = iterateComplexFractal(julia(complex(0)), complex(3), {
            maxIterations: 100,
        });

        expect(result.status).toBe('escaped');
        expect(result.iterations).toBe(0);
    });

    it('rejects invalid iteration budgets', () => {
        expect(() => iterateComplexFractal(mandelbrot, complex(0), { maxIterations: 0 })).toThrow(
            'maxIterations must be a positive integer',
        );
        expect(() => iterateComplexFractal(mandelbrot, complex(0), { maxIterations: 1.5 })).toThrow(
            'maxIterations must be a positive integer',
        );
    });

    it('matches direct Mandelbrot escape timing in the raw loop', () => {
        const direct = iterateComplexFractal(mandelbrot, complex(2), { maxIterations: 100 });
        const raw = iterateMandelbrotPoint(2, 0, 100);

        expect(raw.status).toBe(direct.status);
        expect(raw.iterations).toBe(direct.iterations);
        expect(raw.smoothIteration).toBeCloseTo(direct.smoothIteration!);
    });

    it('matches direct Julia escape timing in the raw loop', () => {
        const parameter = complex(-0.8, 0.156);
        const point = complex(1.5, 0.2);
        const direct = iterateComplexFractal(julia(parameter), point, { maxIterations: 100 });
        const raw = iterateJuliaPoint(point.re, point.im, parameter.re, parameter.im, 100);

        expect(raw.status).toBe(direct.status);
        expect(raw.iterations).toBe(direct.iterations);
    });
});
