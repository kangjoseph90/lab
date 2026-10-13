import { describe, expect, it } from 'vitest';
import { sampleOffsets, sampleGridSize, toLinear, toDisplayByte } from './antialiasing';

describe('fractal sample and color contracts', () => {
    it.each([1, 4, 9] as const)(
        'matches the GPU stratified grid for %s samples without shifting the viewport',
        (samples) => {
            const grid = sampleGridSize(samples);
            const gpuPattern: number[][] = [];
            for (let y = 0; y < grid; y++)
                for (let x = 0; x < grid; x++)
                    gpuPattern.push([(x + 0.5) / grid - 0.5, (y + 0.5) / grid - 0.5]);
            const actual = sampleOffsets(samples);
            expect(actual).toHaveLength(samples);
            actual.forEach((point, i) => {
                expect(point[0]).toBeCloseTo(gpuPattern[i]![0]!, 14);
                expect(point[1]).toBeCloseTo(gpuPattern[i]![1]!, 14);
            });
            expect(actual.reduce((sum, p) => sum + p[0], 0)).toBeCloseTo(0, 14);
            expect(actual.reduce((sum, p) => sum + p[1], 0)).toBeCloseTo(0, 14);
        },
    );

    it('averages black and white in linear light rather than averaging encoded display values', () => {
        expect(toDisplayByte((toLinear(0) + toLinear(255)) / 2)).toBe(188);
        for (const channel of [0, 1, 10, 18, 128, 254, 255])
            expect(toDisplayByte(toLinear(channel))).toBe(channel);
    });
});
