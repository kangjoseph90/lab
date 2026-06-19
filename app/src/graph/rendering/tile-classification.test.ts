import { describe, expect, it } from 'vitest';
import { classifyTile } from './tile-classification';

describe('classifyTile', () => {
    it('classifies a same-sign tile when its gradient cannot reach zero', () => {
        const samples = Array(9).fill(-10) as number[];
        const gradients = Array(9).fill(0.1) as number[];

        expect(classifyTile('lt', samples, gradients, 1)).toBe('inside');
        expect(classifyTile('gt', samples, gradients, 1)).toBe('outside');
        expect(classifyTile('eq', samples, gradients, 1)).toBe('outside');
    });

    it('keeps a tile candidate when its gradient can reach zero', () => {
        const samples = Array(9).fill(0.1) as number[];
        const gradients = Array(9).fill(1) as number[];

        expect(classifyTile('eq', samples, gradients, 1)).toBe('candidate');
    });

    it('keeps sign changes and non-finite samples as candidates', () => {
        expect(classifyTile('eq', [-1, 1], [1, 1], 1)).toBe('candidate');
        expect(classifyTile('eq', [1, Number.NaN], [1, 1], 1)).toBe('candidate');
        expect(classifyTile('eq', [1, 1], [1, Number.NaN], 1)).toBe('candidate');
    });

    it('is invariant when the equation is scaled by a tiny constant', () => {
        const samples = Array(9).fill(-10) as number[];
        const gradients = Array(9).fill(0.1) as number[];
        const scale = 1e-30;

        expect(
            classifyTile(
                'lt',
                samples.map((value) => value * scale),
                gradients.map((value) => value * scale),
                1,
            ),
        ).toBe(classifyTile('lt', samples, gradients, 1));
    });
});
