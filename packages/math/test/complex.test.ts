import { describe, expect, it } from 'vitest';
import {
    add,
    call,
    compileWith,
    complex,
    complexAbs,
    complexAdd,
    complexBackend,
    complexDiv,
    complexMul,
    complexPow,
    differentiate,
    evaluateWith,
    n,
    parse,
    pow,
    s,
} from '../src/index.js';
import type { Complex } from '../src/index.js';

function expectComplexClose(actual: Complex, expected: Complex, precision = 10): void {
    expect(actual.re).toBeCloseTo(expected.re, precision);
    expect(actual.im).toBeCloseTo(expected.im, precision);
}

describe('complex expressions', () => {
    it('supports basic complex arithmetic helpers', () => {
        const z = complex(2, 3);
        const w = complex(-1, 4);

        expectComplexClose(complexAdd(z, w), complex(1, 7));
        expectComplexClose(complexMul(z, w), complex(-14, 5));
        expectComplexClose(complexDiv(complexMul(z, w), w), z);
        expect(complexAbs(complex(3, 4))).toBeCloseTo(5);
    });

    it('evaluates expressions over a complex scope', () => {
        const z = s('z');
        const c = s('c');
        const expr = add(pow(z, n(2)), c);

        expectComplexClose(
            evaluateWith(expr, { z: complex(1, 2), c: complex(-0.5, 0.25) }, complexBackend),
            complex(-3.5, 4.25),
        );
    });

    it('matches real evaluation semantics when inputs are real', () => {
        const expr = parse('sin(x)^2 + cos(x)^2 + exp(0)');

        expectComplexClose(evaluateWith(expr, { x: complex(0.7) }, complexBackend), complex(2));
    });

    it('evaluates common holomorphic functions', () => {
        expectComplexClose(evaluateWith(call('sqrt', n(-1)), {}, complexBackend), complex(0, 1));
        expectComplexClose(
            evaluateWith(call('ln', n(-1)), {}, complexBackend),
            complex(0, Math.PI),
        );
        expectComplexClose(
            evaluateWith(call('sin', call('sqrt', n(-1))), {}, complexBackend),
            complex(0, Math.sinh(1)),
        );
    });

    it('evaluates symbolic derivatives in the complex domain', () => {
        const z = s('z');
        const derivative = differentiate(add(pow(z, n(3)), call('sin', z)), 'z');
        const point = complex(1, 0.5);

        expectComplexClose(
            evaluateWith(derivative, { z: point }, complexBackend),
            complexAdd(
                complexMul(3, complexPow(point, 2)),
                evaluateWith(call('cos', z), { z: point }, complexBackend),
            ),
        );
    });

    it('compiles complex expressions without changing behavior', () => {
        const expr = parse('z^2 + c');
        const compiled = compileWith(expr, ['z', 'c'], complexBackend);
        const z = complex(-0.25, 0.75);
        const c = complex(-0.8, 0.156);

        expectComplexClose(compiled(z, c), evaluateWith(expr, { z, c }, complexBackend));
        expect(() => compiled(z)).toThrow('Expected 2 values');
    });

    it('can use the generic backend compiler for complex expressions', () => {
        const expr = parse('z^2 + c');
        const compiled = compileWith(expr, ['z', 'c'], complexBackend);
        const z = complex(-0.25, 0.75);
        const c = complex(-0.8, 0.156);

        expectComplexClose(compiled(z, c), evaluateWith(expr, { z, c }, complexBackend));
    });

    it('rejects real-only functions clearly', () => {
        expect(() =>
            evaluateWith(
                call('atan2', s('y'), s('x')),
                { x: complex(1), y: complex(1) },
                complexBackend,
            ),
        ).toThrow('Unknown complex function: atan2');
        expect(() => compileWith(parse('round(z)'), ['z'], complexBackend)(complex(1))).toThrow(
            'Unknown complex function: round',
        );
    });
});
