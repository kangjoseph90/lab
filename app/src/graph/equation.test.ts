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
        expect(() => compileEquation('x + w = 0')).toThrow('Unknown symbol: w');
        expect(() => compileEquation('x + z = 0')).toThrow('Use either x/y or z');
    });

    it('lowers real-valued complex expressions into the existing x/y renderer shape', () => {
        const circle = compileEquation('abs(z) = 1');
        const realProjection = compileEquation('re(z^2) = 0');
        const imaginaryProjection = compileEquation('im(sin(z)) = 0');

        expect(circle.value(3, 4)).toBeCloseTo(4);
        expect(circle.dx(3, 4)).toBeCloseTo(3 / 5);
        expect(circle.dy(3, 4)).toBeCloseTo(4 / 5);

        expect(realProjection.value(2, 3)).toBeCloseTo(-5);
        expect(imaginaryProjection.value(0.7, -0.4)).toBeCloseTo(Math.cos(0.7) * Math.sinh(-0.4));
    });

    it('rejects complex-valued expressions that need multiple scalar constraints', () => {
        expect(() => compileEquation('z^2 + 1 = 0')).toThrow(
            'Complex expression must be real-valued',
        );
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
