import { describe, expect, it } from 'vitest';
import { add, call, evaluateInterval, interval, mul, n, pow, s } from '../src/index.js';

describe('evaluateInterval', () => {
    it('evaluates arithmetic bounds conservatively', () => {
        const x = s('x');
        const expr = add(pow(x, n(2)), mul(n(2), x));

        expect(evaluateInterval(expr, { x: interval(-2, 3) })).toEqual(interval(-4, 15));
    });

    it('keeps trigonometric extrema inside the result', () => {
        expect(evaluateInterval(call('sin', s('x')), { x: interval(0, Math.PI) })).toEqual(
            interval(0, 1),
        );
    });

    it('excludes zero above the range of sin even across a reciprocal singularity', () => {
        const expr = add(call('sin', pow(s('x'), n(-1))), mul(n(-1), s('y')));
        const result = evaluateInterval(expr, {
            x: interval(-0.1, 0.1),
            y: interval(1.1, 1.2),
        });

        expect(result.max).toBeLessThan(0);
    });
});
