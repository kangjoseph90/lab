import { describe, expect, it } from 'vitest';
import {
    compile,
    compileWith,
    evaluate,
    evaluateWith,
    numberBackend,
    parse,
} from '../src/index.js';
import type { NumericBackend } from '../src/index.js';

type Box = { value: number };

const boxedBackend: NumericBackend<Box> = {
    fromNumber: (value) => ({ value }),
    neg: (value) => ({ value: -value.value }),
    add: (terms) => ({ value: terms.reduce((sum, term) => sum + term.value, 0) }),
    mul: (factors) => ({ value: factors.reduce((product, factor) => product * factor.value, 1) }),
    pow: (base, exp) => ({ value: base.value ** exp.value }),
    call: (name, args) => {
        switch (name) {
            case 'sin':
                return { value: Math.sin(args[0]!.value) };
            case 'ln':
            case 'log':
                return { value: Math.log(args[0]!.value) };
            default:
                throw new Error(`Unknown boxed function: ${name}`);
        }
    },
};

describe('generic evaluation backends', () => {
    it('evaluates with the number backend using existing real semantics', () => {
        const expr = parse('x^2 + 3 * sin(x) + ln(y)');
        const scope = { x: 1.25, y: 2.5 };

        expect(evaluateWith(expr, scope, numberBackend)).toBeCloseTo(evaluate(expr, scope));
    });

    it('compiles with the number backend without changing results', () => {
        const expr = parse('x^2 + 3 * sin(x) + y');
        const generic = compileWith(expr, ['x', 'y'], numberBackend);
        const fast = compile(expr, ['x', 'y']);

        expect(generic(1.25, 2.5)).toBeCloseTo(fast(1.25, 2.5));
        expect(() => generic(1.25)).toThrow('Expected 2 values');
    });

    it('can evaluate through a non-primitive backend', () => {
        const expr = parse('x^2 + 3 * sin(x) + ln(y)');
        const result = evaluateWith(expr, { x: { value: 1.25 }, y: { value: 2.5 } }, boxedBackend);

        expect(result.value).toBeCloseTo(evaluate(expr, { x: 1.25, y: 2.5 }));
    });

    it('can compile through a non-primitive backend', () => {
        const expr = parse('x^2 + 3 * sin(x) + y');
        const compiled = compileWith(expr, ['x', 'y'], boxedBackend);
        const result = compiled({ value: 1.25 }, { value: 2.5 });

        expect(result.value).toBeCloseTo(1.25 ** 2 + 3 * Math.sin(1.25) + 2.5);
    });

    it('rejects unknown symbols at generic compile time', () => {
        expect(() => compileWith(parse('x + z'), ['x'], numberBackend)).toThrow(
            'Unknown symbol: z',
        );
    });
});
