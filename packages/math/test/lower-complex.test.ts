import { describe, expect, it } from 'vitest';
import {
    compile,
    differentiate,
    evaluate,
    lowerComplex,
    lowerComplexScalar,
    parse,
} from '../src/index.js';

describe('complex lowering', () => {
    it('lowers abs(z) to a real x/y expression', () => {
        const expr = lowerComplexScalar(parse('abs(z) - 1'));
        const value = compile(expr, ['x', 'y']);
        const dx = compile(differentiate(expr, 'x'), ['x', 'y']);
        const dy = compile(differentiate(expr, 'y'), ['x', 'y']);

        expect(value(3, 4)).toBeCloseTo(4);
        expect(dx(3, 4)).toBeCloseTo(3 / 5);
        expect(dy(3, 4)).toBeCloseTo(4 / 5);
    });

    it('lowers real and imaginary projections', () => {
        const real = lowerComplexScalar(parse('re(z^2)'));
        const imag = lowerComplexScalar(parse('im(z^2)'));

        expect(evaluate(real, { x: 2, y: 3 })).toBeCloseTo(-5);
        expect(evaluate(imag, { x: 2, y: 3 })).toBeCloseTo(12);
    });

    it('lowers complex functions through their real and imaginary components', () => {
        const expr = lowerComplexScalar(parse('im(sin(z))'));
        const x = 0.7;
        const y = -0.4;

        expect(evaluate(expr, { x, y })).toBeCloseTo(Math.cos(x) * Math.sinh(y));
    });

    it('supports conjugation before scalar projection', () => {
        const lowered = lowerComplex(parse('conj(z^2)'));

        expect(evaluate(lowered.re, { x: 2, y: 3 })).toBeCloseTo(-5);
        expect(evaluate(lowered.im, { x: 2, y: 3 })).toBeCloseTo(-12);
    });

    it('rejects complex-valued results in scalar lowering', () => {
        expect(() => lowerComplexScalar(parse('z^2 + 1'))).toThrow(
            'Complex expression must be real-valued',
        );
        expect(() => lowerComplexScalar(parse('2^z'))).toThrow(
            'Complex power lowering requires a real exponent',
        );
    });
});
