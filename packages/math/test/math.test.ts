import { describe, expect, it } from 'vitest';
import {
    add,
    call,
    collectSymbols,
    compile,
    differentiate,
    evaluate,
    mul,
    n,
    neg,
    parse,
    pow,
    s,
    simplify,
    substitute,
} from '../src/index.js';
import type { Expr } from '../src/index.js';

describe('math expressions', () => {
    it('keeps expressions in a normalized shape at constructor and simplify boundaries', () => {
        const x = s('x');
        const y = s('y');
        const z = s('z');

        expect(add(n(2), add(x, n(3)), n(-5))).toEqual(x);
        expect(mul(n(2), mul(x, n(3)), n(0), y)).toEqual(n(0));
        expect(mul(n(2), mul(x, n(3)), y)).toEqual(mul(n(6), x, y));
        expect(simplify(add(mul(n(2), pow(x, n(1)), n(1)), n(0)))).toEqual(mul(n(2), x));
        expect(add(x, add(y, z))).toEqual(add(x, y, z));
        expect(pow(n(0), x)).toEqual(n(0));
        expect(pow(n(1), x)).toEqual(n(1));
        expect(neg(neg(x))).toEqual(x);
    });

    it('evaluates and compiles the same multi-symbol expression', () => {
        const x = s('x');
        const y = s('y');
        const expr = add(pow(x, n(2)), mul(n(3), y), call('sin', x));
        const scope = { x: 2, y: 5 };

        expect(evaluate(expr, scope)).toBeCloseTo(4 + 15 + Math.sin(2));
        expect(compile(expr, ['x', 'y'])(2, 5)).toBeCloseTo(evaluate(expr, scope));
        expect(() => compile(expr, ['x', 'y'])(2)).toThrow('Expected 2 values');
    });

    it('evaluates the extended builtin functions', () => {
        expect(evaluate(call('asin', n(1)))).toBeCloseTo(Math.asin(1));
        expect(evaluate(call('atan', n(1)))).toBeCloseTo(Math.PI / 4);
        expect(evaluate(call('sinh', n(0)))).toBeCloseTo(0);
        expect(evaluate(call('cosh', n(0)))).toBeCloseTo(1);
        expect(evaluate(call('tanh', n(0)))).toBeCloseTo(0);
        expect(evaluate(call('floor', n(2.7)))).toBe(2);
        expect(evaluate(call('ceil', n(2.1)))).toBe(3);
        expect(evaluate(call('round', n(2.5)))).toBe(3);
        expect(evaluate(call('atan2', n(1), n(1)))).toBeCloseTo(Math.PI / 4);
    });

    it('compiles to a function that matches evaluate across builtins and shapes', () => {
        const cases: Array<[Expr, Record<string, number>, string[]]> = [
            [parse('x^2 + 3 * sin(x) + 2 * y - ln(x)'), { x: 1.5, y: 2.5 }, ['x', 'y']],
            [parse('2^3^2'), {}, []],
            [parse('atan2(y, x)'), { x: 1, y: 1 }, ['x', 'y']],
            [parse('sinh(x) + cosh(x)'), { x: 0.7 }, ['x']],
        ];

        for (const [expr, scope, symbols] of cases) {
            const compiled = compile(expr, symbols);
            const values = symbols.map((name) => scope[name]!);

            expect(compiled(...values)).toBeCloseTo(evaluate(expr, scope));
        }
    });

    it('preserves division-by-zero and zero-power semantics through compile', () => {
        expect(compile(parse('1 / 0'), [])()).toBe(Infinity);
        expect(compile(parse('0 ^ 0'), [])()).toBe(1);
        expect(compile(parse('0 ^ -1'), [])()).toBe(Infinity);
        expect(compile(parse('-2 ^ 2'), [])()).toBe(-4);
    });

    it('rejects unknown symbols and functions at compile time, not runtime', () => {
        expect(() => compile(parse('x + z'), ['x'])).toThrow('Unknown symbol: z');
        expect(() => compile(parse('foo(x)'), ['x'])).toThrow('Unknown function: foo');
    });

    it('substitutes subexpressions without losing later evaluation semantics', () => {
        const x = s('x');
        const t = s('t');
        const expr = add(pow(x, n(2)), mul(n(2), x), n(1));
        const shifted = substitute(expr, { x: add(t, n(1)) });

        expect(collectSymbols(shifted)).toEqual(new Set(['t']));
        expect(evaluate(shifted, { t: 3 })).toBe(evaluate(expr, { x: 4 }));
    });

    it('differentiates polynomials and simplifies product-rule noise', () => {
        const x = s('x');
        const y = s('y');
        const expr = mul(add(pow(x, n(2)), n(1)), add(x, y));
        const derivative = differentiate(expr, 'x');

        expect(evaluate(derivative, { x: 3, y: 4 })).toBeCloseTo(6 * 7 + 10);
    });

    it('differentiates common unary calls with the chain rule', () => {
        const x = s('x');
        const inner = add(pow(x, n(2)), n(1));
        const sinDerivative = differentiate(call('sin', inner), 'x');
        const lnDerivative = differentiate(call('ln', inner), 'x');

        expect(evaluate(sinDerivative, { x: 3 })).toBeCloseTo(6 * Math.cos(10));
        expect(evaluate(lnDerivative, { x: 3 })).toBeCloseTo(6 / 10);
    });

    it('differentiates inverse trig and hyperbolic functions via the chain rule', () => {
        const x = s('x');
        const point = { x: 0.5 };

        expect(evaluate(differentiate(call('asin', x), 'x'), point)).toBeCloseTo(
            1 / Math.sqrt(1 - 0.25),
        );
        expect(evaluate(differentiate(call('acos', x), 'x'), point)).toBeCloseTo(
            -1 / Math.sqrt(1 - 0.25),
        );
        expect(evaluate(differentiate(call('atan', x), 'x'), point)).toBeCloseTo(1 / (1 + 0.25));
        expect(evaluate(differentiate(call('sinh', x), 'x'), point)).toBeCloseTo(Math.cosh(0.5));
        expect(evaluate(differentiate(call('cosh', x), 'x'), point)).toBeCloseTo(Math.sinh(0.5));
        expect(evaluate(differentiate(call('tanh', x), 'x'), point)).toBeCloseTo(
            1 / Math.cosh(0.5) ** 2,
        );
    });

    it('supports the general power rule for variable exponents', () => {
        const x = s('x');
        const expr = pow(x, x);
        const derivative = differentiate(expr, 'x');

        expect(evaluate(derivative, { x: 2 })).toBeCloseTo(4 * (Math.log(2) + 1));
    });

    it('rejects unsupported symbolic operations clearly', () => {
        expect(() => evaluate(s('missing'))).toThrow('Unknown symbol: missing');
        expect(() => differentiate(call('max', s('x'), n(1)), 'x')).toThrow(
            'Cannot differentiate function with multiple args: max',
        );
    });
});
