export type RawOrbitResult = {
    status: 'escaped' | 'bounded';
    iterations: number;
    zx: number;
    zy: number;
    smoothIteration?: number;
};

export function iterateMandelbrotPoint(
    cx: number,
    cy: number,
    maxIterations: number,
): RawOrbitResult {
    assertMaxIterations(maxIterations);

    let zx = 0;
    let zy = 0;

    for (let iterations = 0; iterations < maxIterations; iterations += 1) {
        const zx2 = zx * zx;
        const zy2 = zy * zy;

        if (zx2 + zy2 > 4) return escaped(iterations, zx, zy);

        zy = 2 * zx * zy + cy;
        zx = zx2 - zy2 + cx;
    }

    const zx2 = zx * zx;
    const zy2 = zy * zy;

    if (zx2 + zy2 > 4) return escaped(maxIterations, zx, zy);

    return { status: 'bounded', iterations: maxIterations, zx, zy };
}

export function iterateJuliaPoint(
    zx: number,
    zy: number,
    cx: number,
    cy: number,
    maxIterations: number,
): RawOrbitResult {
    assertMaxIterations(maxIterations);

    for (let iterations = 0; iterations < maxIterations; iterations += 1) {
        const zx2 = zx * zx;
        const zy2 = zy * zy;

        if (zx2 + zy2 > 4) return escaped(iterations, zx, zy);

        zy = 2 * zx * zy + cy;
        zx = zx2 - zy2 + cx;
    }

    const zx2 = zx * zx;
    const zy2 = zy * zy;

    if (zx2 + zy2 > 4) return escaped(maxIterations, zx, zy);

    return { status: 'bounded', iterations: maxIterations, zx, zy };
}

function escaped(iterations: number, zx: number, zy: number): RawOrbitResult {
    return {
        status: 'escaped',
        iterations,
        zx,
        zy,
        smoothIteration: smoothEscapeTimeRaw(zx, zy, iterations),
    };
}

export function smoothEscapeTimeRaw(zx: number, zy: number, iterations: number, power = 2): number {
    const magnitude = Math.hypot(zx, zy);

    if (magnitude <= 1) return iterations;

    return iterations + 1 - Math.log(Math.log(magnitude)) / Math.log(power);
}

function assertMaxIterations(maxIterations: number): void {
    if (maxIterations < 1 || !Number.isInteger(maxIterations)) {
        throw new Error('maxIterations must be a positive integer.');
    }
}
