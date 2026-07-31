import { complex, complexAdd, complexMul } from '@lab/math';
import type { Complex } from '@lab/math';
import type { ComplexFractal } from './complex-fractal.js';
import { smoothEscapeTime } from './iterate.js';

export const mandelbrot: ComplexFractal = {
    name: 'Mandelbrot',
    escapeRadius: 2,
    init: () => complex(0),
    step: (z, c) => complexAdd(complexMul(z, z), c),
    smoothIteration: (z, iterations) => smoothEscapeTime(z, iterations),
};

export function mandelbrotStep(z: Complex, c: Complex): Complex {
    return mandelbrot.step(z, c);
}
