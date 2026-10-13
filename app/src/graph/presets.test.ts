import { describe, expect, it } from 'vitest';
import { compileEquation } from './equation';
import { GRAPH_PRESETS, presetViewport } from './presets';
import { createGraphShader } from './rendering/gpu-shader';

function preset(id: string) {
    const entry = GRAPH_PRESETS.find((entry) => entry.id === id);
    if (!entry) throw new Error(`Unknown preset: ${id}`);
    return entry;
}

describe('recommended equations', () => {
    it.each(GRAPH_PRESETS)('compiles $id for both CPU and GPU', (entry) => {
        const equation = compileEquation(entry.expression);
        expect(createGraphShader(equation)).toBeTruthy();
        // All presets should evaluate somewhere inside their recommended view.
        const step = Math.min(entry.view.spanX, entry.view.spanY) / 8;
        const values: number[] = [];
        for (let x = -2; x <= 2; x++) {
            for (let y = -2; y <= 2; y++) {
                values.push(
                    equation.value(entry.view.centerX + x * step, entry.view.centerY + y * step),
                );
            }
        }
        expect(values.some(Number.isFinite)).toBe(true);
    });

    it('contains stable fixed-point parameters but excludes known exterior points from the cardioid', () => {
        const equation = compileEquation(preset('mandelbrot-cardioid').expression);
        expect(equation.value(0, 0)).toBeLessThan(0);
        expect(equation.value(-0.5, 0)).toBeLessThan(0);
        expect(equation.value(0.25, 0)).toBe(0);
        expect(equation.value(-0.75, 0)).toBe(0);
        expect(equation.value(-1, 0)).toBeGreaterThan(0);
        expect(equation.value(0, 1)).toBeGreaterThan(0);
        // Boundary parameters c = lambda/2 - lambda^2/4, |lambda| = 1.
        for (let i = 0; i < 24; i++) {
            const angle = (i / 24) * 2 * Math.PI;
            const x = 0.5 * Math.cos(angle) - 0.25 * Math.cos(2 * angle);
            const y = 0.5 * Math.sin(angle) - 0.25 * Math.sin(2 * angle);
            expect(equation.value(x, y)).toBeCloseTo(0, 10);
        }
    });

    it('draws the period-two disk and its exact union with the cardioid', () => {
        const disk = compileEquation(preset('mandelbrot-period-2').expression);
        const cardioid = compileEquation(preset('mandelbrot-cardioid').expression);
        const union = compileEquation(preset('mandelbrot-main-regions').expression);
        expect(disk.value(-1, 0)).toBeLessThan(0);
        expect(disk.value(-1.25, 0)).toBe(0);
        expect(disk.value(-1, 0.25)).toBe(0);
        expect(disk.value(0, 0)).toBeGreaterThan(0);
        for (let x = -1.5; x <= 0.5; x += 0.07) {
            for (let y = -1; y <= 1; y += 0.07) {
                expect(union.value(x, y) <= 0).toBe(
                    cardioid.value(x, y) <= 0 || disk.value(x, y) <= 0,
                );
            }
        }
    });

    it('matches the third critical-orbit iterate for the Mandelbrot approximation', () => {
        const equation = compileEquation(preset('mandelbrot-escape-3').expression);
        for (const [x, y] of [
            [0, 0],
            [-1, 0],
            [-0.2, 0.7],
            [0.5, 0.5],
            [-2, 0],
            [1, 1],
        ]) {
            let re = 0;
            let im = 0;
            for (let n = 0; n < 3; n++) {
                [re, im] = [re * re - im * im + x!, 2 * re * im + y!];
            }
            expect(equation.value(x!, y!)).toBeCloseTo(Math.hypot(re, im) - 2, 10);
        }
    });

    it.each([
        { x: 900, y: 600 },
        { x: 390, y: 450 },
        { x: 1, y: 1 },
    ])('fits both axes in a $x × $y canvas', (size) => {
        for (const entry of GRAPH_PRESETS) {
            const view = presetViewport(entry, size);
            expect(view.unitsPerPixel * size.x).toBeGreaterThanOrEqual(entry.view.spanX - 1e-10);
            expect(view.unitsPerPixel * size.y).toBeGreaterThanOrEqual(entry.view.spanY - 1e-10);
            expect(view.centerX).toBe(entry.view.centerX);
            expect(view.centerY).toBe(entry.view.centerY);
        }
    });
});
