import { complexAbs } from '@lab/math';
import type { Complex } from '@lab/math';
import type { ComplexFractal, IterateOptions, OrbitResult } from './complex-fractal.js';

export function iterateComplexFractal(
    fractal: ComplexFractal,
    c: Complex,
    options: IterateOptions,
): OrbitResult {
    if (options.maxIterations < 1 || !Number.isInteger(options.maxIterations)) {
        throw new Error('maxIterations must be a positive integer.');
    }

    const escapeRadius = fractal.escapeRadius;
    const escapeRadiusSquared = escapeRadius * escapeRadius;
    let z = fractal.init(c);

    for (let iterations = 0; iterations < options.maxIterations; iterations += 1) {
        if (escaped(z, escapeRadiusSquared)) {
            return escapedResult(fractal, z, iterations, escapeRadius);
        }

        z = fractal.step(z, c);
    }

    if (escaped(z, escapeRadiusSquared)) {
        return escapedResult(fractal, z, options.maxIterations, escapeRadius);
    }

    return {
        status: 'bounded',
        iterations: options.maxIterations,
        z,
        escapeRadius,
    };
}

function escaped(z: Complex, escapeRadiusSquared: number): boolean {
    const magnitudeSquared = z.re * z.re + z.im * z.im;
    return magnitudeSquared > escapeRadiusSquared;
}

function escapedResult(
    fractal: ComplexFractal,
    z: Complex,
    iterations: number,
    escapeRadius: number,
): OrbitResult {
    const smoothIteration = fractal.smoothIteration?.(z, iterations);

    return smoothIteration === undefined
        ? { status: 'escaped', iterations, z, escapeRadius }
        : { status: 'escaped', iterations, z, escapeRadius, smoothIteration };
}

export function smoothEscapeTime(z: Complex, iterations: number, power = 2): number {
    const magnitude = complexAbs(z);

    if (magnitude <= 1) return iterations;

    return iterations + 1 - Math.log(Math.log(magnitude)) / Math.log(power);
}
