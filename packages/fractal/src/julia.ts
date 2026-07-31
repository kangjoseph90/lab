import { complexAdd, complexMul } from '@lab/math';
import type { Complex } from '@lab/math';
import type { ComplexFractal } from './complex-fractal.js';
import { smoothEscapeTime } from './iterate.js';

export function julia(parameter: Complex): ComplexFractal {
    return {
        name: 'Julia',
        escapeRadius: 2,
        init: (z) => z,
        step: (z) => complexAdd(complexMul(z, z), parameter),
        smoothIteration: (z, iterations) => smoothEscapeTime(z, iterations),
    };
}
