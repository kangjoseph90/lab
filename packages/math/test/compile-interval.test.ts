import { describe, expect, it } from 'vitest';
import {
    add,
    call,
    compileInterval,
    evaluateInterval,
    interval,
    mul,
    n,
    parse,
    pow,
    s,
} from '../src/index.js';

describe('compileInterval', () => {
    it('matches evaluateInterval on arithmetic bounds', () => {
        const expr = add(pow(s('x'), n(2)), mul(n(2), s('x')));
        const compiled = compileInterval(expr, ['x']);
        const scope = { x: interval(-2, 3) };

        expect(compiled(scope)).toEqual(evaluateInterval(expr, scope));
        expect(compiled(scope)).toEqual(interval(-4, 15));
    });

    it('matches evaluateInterval on trigonometric extrema', () => {
        const expr = call('sin', s('x'));
        const compiled = compileInterval(expr, ['x']);
        const scope = { x: interval(0, Math.PI) };

        expect(compiled(scope)).toEqual(evaluateInterval(expr, scope));
        expect(compiled(scope)).toEqual(interval(0, 1));
    });

    it('matches evaluateInterval across a reciprocal singularity', () => {
        const expr = add(call('sin', pow(s('x'), n(-1))), mul(n(-1), s('y')));
        const compiled = compileInterval(expr, ['x', 'y']);
        const scope = { x: interval(-0.1, 0.1), y: interval(1.1, 1.2) };

        expect(compiled(scope)).toEqual(evaluateInterval(expr, scope));
        expect(compiled(scope).max).toBeLessThan(0);
    });

    it('matches evaluateInterval for even powers crossing zero', () => {
        const expr = pow(s('x'), n(2));
        const compiled = compileInterval(expr, ['x']);
        const scope = { x: interval(-3, 2) };

        expect(compiled(scope)).toEqual(evaluateInterval(expr, scope));
        expect(compiled(scope)).toEqual(interval(0, 9));
    });

    it('matches evaluateInterval for negative integer powers', () => {
        const expr = pow(s('x'), n(-2));
        const compiled = compileInterval(expr, ['x']);
        const awayFromZero = { x: interval(2, 4) };

        expect(compiled(awayFromZero)).toEqual(evaluateInterval(expr, awayFromZero));
        expect(compiled(awayFromZero)).toEqual(interval(0.0625, 0.25));
    });

    it('matches evaluateInterval when a reciprocal crosses zero (saturated to ALL)', () => {
        const expr = pow(s('x'), n(-1));
        const compiled = compileInterval(expr, ['x']);
        const crossingZero = { x: interval(-1, 1) };

        expect(compiled(crossingZero)).toEqual(evaluateInterval(expr, crossingZero));
    });

    it('matches evaluateInterval on ln across domain boundaries', () => {
        const expr = call('ln', add(s('x'), n(2)));
        const compiled = compileInterval(expr, ['x']);

        const allNegative = { x: interval(-4, -3) };
        const straddlingZero = { x: interval(-3, 0) };
        const positive = { x: interval(1, 3) };

        expect(compiled(allNegative)).toEqual(evaluateInterval(expr, allNegative));
        expect(compiled(straddlingZero)).toEqual(evaluateInterval(expr, straddlingZero));
        expect(compiled(positive)).toEqual(evaluateInterval(expr, positive));
    });

    it('matches evaluateInterval on sqrt and asin domains', () => {
        const sqrtExpr = call('sqrt', s('x'));
        const sqrtCompiled = compileInterval(sqrtExpr, ['x']);
        const sqrtNegative = { x: interval(-2, -1) };

        expect(sqrtCompiled(sqrtNegative)).toEqual(evaluateInterval(sqrtExpr, sqrtNegative));

        const asinExpr = call('asin', s('x'));
        const asinCompiled = compileInterval(asinExpr, ['x']);
        const outOfDomain = { x: interval(2, 3) };

        expect(asinCompiled(outOfDomain)).toEqual(evaluateInterval(asinExpr, outOfDomain));
    });

    it('matches evaluateInterval across a broad random fuzz', () => {
        const exprs = [
            'x^2 + y^2 - 4',
            'sin(x) - y',
            'cos(x*y)',
            'x^3 - y',
            'abs(x) - y',
            'exp(x) - y',
            'atan(x) - y',
            'sinh(x) - cosh(y)',
            'x^2 - 3*x*y + y^2',
            'floor(x) - y',
            '-x^2 - y',
            '2*x - 3*y + 1',
            'x^2 + sin(y)',
            'sqrt(x+1) - y',
        ];
        const names = (expr: import('../src/index.js').Expr): string[] => {
            const set = new Set<string>();
            const walk = (e: import('../src/index.js').Expr): void => {
                if (e.type === 'sym') set.add(e.name);
                else if (e.type === 'add') e.terms.forEach(walk);
                else if (e.type === 'mul') e.factors.forEach(walk);
                else if (e.type === 'neg') walk(e.value);
                else if (e.type === 'pow') {
                    walk(e.base);
                    walk(e.exp);
                } else if (e.type === 'call') e.args.forEach(walk);
            };
            walk(expr);
            return [...set];
        };
        const rnd = (lo: number, hi: number): number =>
            Math.floor(Math.random() * (hi - lo + 1)) + lo;
        const rndInterval = () => {
            const a = rnd(-4, 4) + Math.random();
            return interval(a, a + Math.random() * 3 + 0.01);
        };

        let checked = 0;

        for (const src of exprs) {
            const parsed = parse(src);
            const syms = names(parsed);
            const compiled = compileInterval(parsed, syms);

            for (let i = 0; i < 200; i += 1) {
                const scope: Record<string, ReturnType<typeof interval>> = {};
                for (const name of syms) scope[name] = rndInterval();
                const tree = evaluateInterval(parsed, scope);
                const code = compiled(scope);
                expect(code.min).toBeCloseTo(tree.min, 6);
                expect(code.max).toBeCloseTo(tree.max, 6);
                checked += 1;
            }
        }
        expect(checked).toBeGreaterThan(2000);
    });

    it('rejects unknown symbols and non-integer exponents at compile time', () => {
        expect(() => compileInterval(s('z'), ['x'])).toThrow('Unknown symbol: z');
        expect(() => compileInterval(pow(s('x'), s('y')), ['x', 'y'])).toThrow(
            'Unsupported interval exponent',
        );
        expect(() => compileInterval(call('foo', s('x')), ['x'])).toThrow('Unknown function: foo');
    });
});
