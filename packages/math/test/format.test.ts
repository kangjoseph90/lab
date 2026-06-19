import { describe, expect, it } from 'vitest';
import { add, call, evaluate, format, mul, n, neg, parse, pow, s } from '../src/index.js';

describe('format', () => {
    it('renders atoms', () => {
        expect(format(n(2))).toBe('2');
        expect(format(n(3.14))).toBe('3.14');
        expect(format(s('x'))).toBe('x');
        expect(format(call('sin', s('x')))).toBe('sin(x)');
        expect(format(call('atan2', s('y'), s('x')))).toBe('atan2(y, x)');
    });

    it('renders addition and folds negative terms into subtraction', () => {
        expect(format(add(s('x'), n(3)))).toBe('x + 3');
        expect(format(add(s('x'), n(-3)))).toBe('x - 3');
        expect(format(add(s('a'), s('b'), n(5)))).toBe('a + b + 5');
    });

    it('renders multiplication', () => {
        expect(format(mul(s('a'), s('b')))).toBe('a * b');
        expect(format(mul(n(2), s('x')))).toBe('2 * x');
        expect(format(mul(n(-2), s('x')))).toBe('-2 * x');
    });

    it('parenthesizes lower-precedence children of mul and pow', () => {
        expect(format(mul(add(s('x'), n(1)), s('y')))).toBe('(x + 1) * y');
        expect(format(pow(add(s('x'), n(1)), n(2)))).toBe('(x + 1) ^ 2');
        expect(format(pow(s('x'), mul(s('a'), s('b'))))).toBe('x ^ (a * b)');
    });

    it('keeps the power operator right-associative without parentheses', () => {
        expect(format(pow(s('x'), pow(s('x'), n(2))))).toBe('x ^ x ^ 2');
        expect(format(pow(pow(s('x'), s('x')), n(2)))).toBe('(x ^ x) ^ 2');
    });

    it('renders negation', () => {
        expect(format(neg(s('x')))).toBe('-x');
        expect(format(neg(add(s('x'), n(1))))).toBe('-(x + 1)');
    });

    it('round-trips parsed expressions back to a readable form', () => {
        expect(format(parse('x + 3 * y'))).toBe('x + 3 * y');
        expect(format(parse('x ^ 2 + 3 * y + sin(x)'))).toBe('x ^ 2 + 3 * y + sin(x)');
        expect(format(parse('(x + 1) * (x - 1)'))).toBe('(x + 1) * (x - 1)');
    });

    it('folds constant-only expressions, so format shows the folded value', () => {
        expect(format(parse('2 + 3 * 4'))).toBe('14');
    });

    it('produces output that re-parses to the same evaluated value', () => {
        const original = parse('x ^ 2 + 3 * sin(x) - 5');
        const reparsed = parse(format(original));
        const scope = { x: 1.5 };

        expect(evaluate(reparsed, scope)).toBeCloseTo(evaluate(original, scope));
    });
});
