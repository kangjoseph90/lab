import { describe, expect, it, vi } from 'vitest';
import { parse } from '@lab/math';
import type { CompiledEquation, Relation } from '../equation';
import { getCoverage } from './render-coverage';

function compiled(relation: Relation, value: number): CompiledEquation {
    return {
        relation,
        expr: { type: 'num', value },
        value: () => value,
        dx: vi.fn(() => 1),
        dy: vi.fn(() => 0),
        interval: () => ({ min: value, max: value }),
    };
}

describe('getCoverage', () => {
    it('uses only the value for a strict inequality', () => {
        const equation = compiled('lt', -1);

        expect(getCoverage(equation, 0, 0, 0.01, 0.01)).toBeGreaterThan(0);
        expect(equation.dx).not.toHaveBeenCalled();
        expect(equation.dy).not.toHaveBeenCalled();
    });

    it('uses Newton verification for non-strict pixels near the boundary', () => {
        const equation: CompiledEquation = {
            relation: 'lte',
            expr: { type: 'sym', name: 'x' },
            value: (x) => x!,
            dx: vi.fn(() => 1),
            dy: vi.fn(() => 0),
            interval: () => ({ min: 0, max: 0.004 }),
        };

        expect(getCoverage(equation, 0.004, 0, 0.01, 0.01)).toBeGreaterThan(0);
        expect(equation.dx).toHaveBeenCalled();
        expect(equation.dy).toHaveBeenCalled();
    });

    it('preserves a tangent zero without a sign change', () => {
        const equation: CompiledEquation = {
            relation: 'eq',
            expr: { type: 'pow', base: { type: 'sym', name: 'x' }, exp: { type: 'num', value: 2 } },
            value: (x) => x! * x!,
            dx: (x) => 2 * x!,
            dy: () => 0,
            interval: () => ({ min: 0, max: 0.005 }),
        };

        expect(getCoverage(equation, 0.005, 0, 0.0135, 0.01)).toBeGreaterThan(0);
    });

    it('rejects a large gradient that does not converge to a zero', () => {
        const equation: CompiledEquation = {
            relation: 'eq',
            expr: parse('2 + sin(1000 * x)'),
            value: (x) => 2 + Math.sin(1000 * x!),
            dx: (x) => 1000 * Math.cos(1000 * x!),
            dy: () => 0,
            interval: () => ({ min: 1, max: 3 }),
        };

        expect(getCoverage(equation, 0, 0, 0.0135, 0.01)).toBe(0);
        expect(getCoverage(equation, 0, 0, 135, 100)).toBe(0);
    });

    it('rejects a single lucky residual improvement', () => {
        const equation: CompiledEquation = {
            relation: 'eq',
            expr: { type: 'num', value: 1 },
            value: (x) => (x === 0 ? 16 : 1),
            dx: () => 1000,
            dy: () => 0,
            interval: () => ({ min: 1, max: 16 }),
        };

        expect(getCoverage(equation, 0, 0, 0.0135, 0.01)).toBe(0);
    });

    it('rejects a Newton step outside the four-pixel trust radius', () => {
        const equation: CompiledEquation = {
            relation: 'eq',
            expr: { type: 'num', value: 1 },
            value: () => 1,
            dx: () => 1,
            dy: () => 0,
            interval: () => ({ min: 1, max: 1 }),
        };

        expect(getCoverage(equation, 0, 0, 0.0135, 0.01)).toBe(0);
    });
});
