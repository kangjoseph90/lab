import { describe, expect, it } from 'vitest';
import { compileEquation, parseEquation } from './equation';

describe('compileEquation', () => {
    it('converts an equality to a zero-level function with its gradient', () => {
        const circle = compileEquation('x^2 + y^2 = 4');

        expect(circle.value(2, 0)).toBe(0);
        expect(circle.value(0, 0)).toBe(-4);
        expect(circle.dx(2, 0)).toBe(4);
        expect(circle.dy(0, -2)).toBe(-4);
    });

    it('rejects symbols outside the graph coordinate pair', () => {
        expect(() => compileEquation('x + z = 0')).toThrow('Unknown symbol: z');
    });

    it.each([
        ['x < y', 'lt'],
        ['x <= y', 'lte'],
        ['x > y', 'gt'],
        ['x >= y', 'gte'],
        ['x = y', 'eq'],
    ] as const)('preserves the relation in %s', (input, relation) => {
        expect(parseEquation(input).relation).toBe(relation);
    });

    it('rejects chained relations', () => {
        expect(() => parseEquation('0 < x < 1')).toThrow('only one relation');
    });
});
