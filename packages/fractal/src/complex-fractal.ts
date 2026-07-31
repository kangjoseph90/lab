import type { Complex } from '@lab/math';

export type ComplexFractal = {
    name: string;
    escapeRadius: number;
    init(c: Complex): Complex;
    step(z: Complex, c: Complex): Complex;
    smoothIteration?(z: Complex, iterations: number): number;
};

export type IterateOptions = {
    maxIterations: number;
};

export type OrbitResult = {
    status: 'escaped' | 'bounded';
    iterations: number;
    z: Complex;
    escapeRadius: number;
    smoothIteration?: number;
};
