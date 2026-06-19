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
} from '../src/index.js';

describe('parse', () => {
    it('parses literals and decimals', () => {
        expect(parse('2')).toEqual(n(2));
        expect(parse('3.14')).toEqual(n(3.14));
        expect(parse('.5')).toEqual(n(0.5));
        expect(parse('1.')).toEqual(n(1));
        expect(parse('0.')).toEqual(n(0));
        expect(parse('.25')).toEqual(n(0.25));
        expect(parse('10.5')).toEqual(n(10.5));
        expect(parse('x')).toEqual(s('x'));
        expect(parse('xy')).toEqual(s('xy'));
    });

    it('encodes operator precedence through the builders', () => {
        expect(parse('2 + 3 * 4')).toEqual(add(n(2), mul(n(3), n(4))));
        expect(parse('(2 + 3) * 4')).toEqual(mul(n(5), n(4)));
        expect(parse('2 * 3 + 4')).toEqual(add(mul(n(2), n(3)), n(4)));
    });

    it('normalizes via the constructors, so constants fold', () => {
        expect(parse('2 + 3')).toEqual(n(5));
        expect(parse('2 * 3')).toEqual(n(6));
        expect(parse('1 * x')).toEqual(s('x'));
        expect(parse('x + 0')).toEqual(s('x'));
    });

    it('binds unary minus looser than power, matching math convention', () => {
        expect(parse('-2^2')).toEqual(neg(pow(n(2), n(2))));
        expect(evaluate(parse('-2^2'))).toBe(-4);
        expect(evaluate(parse('-(2^2)'))).toBe(-4);
    });

    it('right-associates the power operator', () => {
        expect(evaluate(parse('2^3^2'))).toBe(512);
    });

    it('encodes division as multiplication by a reciprocal power', () => {
        expect(parse('1 / 2')).toEqual(pow(n(2), n(-1)));
        expect(evaluate(parse('1 / 2'))).toBe(0.5);
        expect(evaluate(parse('a / b / c'), { a: 24, b: 2, c: 3 })).toBe(4);
        expect(evaluate(parse('a / (b * c)'), { a: 24, b: 2, c: 3 })).toBe(4);
    });

    it('keeps division by zero out of the constant folder', () => {
        expect(evaluate(parse('1 / 0'))).toBe(Infinity);
        expect(parse('0 ^ 0')).toEqual(n(1));
        expect(evaluate(parse('0 ^ -1'))).toBe(Infinity);
    });

    it('folds zero to a symbolic power, matching the constructor policy', () => {
        expect(parse('0 ^ x')).toEqual(n(0));
        expect(collectSymbols(parse('0 ^ x'))).toEqual(new Set());
        expect(evaluate(parse('0 ^ x'), { x: 3 })).toBe(0);
    });

    it('parses calls with a single argument', () => {
        expect(parse('sin(x)')).toEqual(call('sin', s('x')));
        expect(parse('ln(x + 1)')).toEqual(call('ln', add(s('x'), n(1))));
    });

    it('parses calls with multiple arguments', () => {
        expect(parse('max(a, b)')).toEqual(call('max', s('a'), s('b')));
        expect(parse('f(x, y, z)')).toEqual(call('f', s('x'), s('y'), s('z')));
    });

    it('tolerates surrounding and interleaving whitespace', () => {
        expect(parse('  2  +  3  ')).toEqual(n(5));
        expect(parse('x*y')).toEqual(mul(s('x'), s('y')));
    });

    it('round-trips through evaluate and differentiate', () => {
        const expr = parse('x^2 + 3 * y + sin(x)');
        const scope = { x: 2, y: 5 };
        expect(evaluate(expr, scope)).toBeCloseTo(4 + 15 + Math.sin(2));
        expect(compile(expr, ['x', 'y'])(2, 5)).toBeCloseTo(evaluate(expr, scope));

        const derivative = differentiate(parse('(x^2 + 1) * (x + y)'), 'x');
        expect(evaluate(derivative, { x: 3, y: 4 })).toBeCloseTo(6 * 7 + 10);
    });

    it('rejects malformed input with positioned errors', () => {
        expect(() => parse('2 +')).toThrow('Unexpected end of input at 1:4');
        expect(() => parse('2x')).toThrow("Unexpected 'x' at 1:2");
        expect(() => parse('(1')).toThrow("Expected ')' at 1:3");
        expect(() => parse('1 2')).toThrow("Unexpected '2' at 1:3");
        expect(() => parse('sin(x')).toThrow("Expected ')' at 1:6");
        expect(() => parse('@')).toThrow("Unexpected character '@' at 1:1");
    });

    it('rejects numeric literals with a second decimal point', () => {
        expect(() => parse('.5.6')).toThrow('Unexpected second decimal point at 1:3');
        expect(() => parse('.5.')).toThrow('Unexpected second decimal point at 1:3');
        expect(() => parse('1.2.3')).toThrow('Unexpected second decimal point at 1:4');
    });
});
