import { dd, ddAdd, ddMul } from '@lab/precision';
import type { DoubleDouble } from '@lab/precision';
import type { RawOrbitResult } from './raw.js';
import { smoothEscapeTimeRaw } from './raw.js';

const SPLITTER = 134217729;

export type DoubleDoubleComplex = {
    re: DoubleDouble;
    im: DoubleDouble;
};

export function ddComplex(
    re: DoubleDouble | number,
    im: DoubleDouble | number,
): DoubleDoubleComplex {
    return {
        re: typeof re === 'number' ? dd(re) : re,
        im: typeof im === 'number' ? dd(im) : im,
    };
}

export function mandelbrotCoordinateDD(
    center: DoubleDouble,
    pixel: number,
    size: number,
    unitsPerPixel: DoubleDouble,
): DoubleDouble {
    return ddAdd(center, ddMul(dd(pixel - size / 2), unitsPerPixel));
}

export function iterateMandelbrotPointDD(
    c: DoubleDoubleComplex,
    maxIterations: number,
): RawOrbitResult {
    return iterateQuadraticDD(ddComplex(0, 0), c, maxIterations);
}

export function iterateJuliaPointDD(
    z: DoubleDoubleComplex,
    c: DoubleDoubleComplex,
    maxIterations: number,
): RawOrbitResult {
    return iterateQuadraticDD(z, c, maxIterations);
}

function iterateQuadraticDD(
    z: DoubleDoubleComplex,
    c: DoubleDoubleComplex,
    maxIterations: number,
): RawOrbitResult {
    assertMaxIterations(maxIterations);

    let zxHi = z.re.hi;
    let zxLo = z.re.lo;
    let zyHi = z.im.hi;
    let zyLo = z.im.lo;
    const zx2 = ddParts();
    const zy2 = ddParts();
    const nextX = ddParts();
    const nextY = ddParts();
    const product = ddParts();

    for (let iterations = 0; iterations < maxIterations; iterations += 1) {
        setSqr(zx2, zxHi, zxLo);
        setSqr(zy2, zyHi, zyLo);

        if (escaped(zx2, zy2)) return escapedResult(iterations, zxHi, zxLo, zyHi, zyLo);

        setMul(product, zxHi, zxLo, zyHi, zyLo);
        setAdd(nextY, product.hi * 2, product.lo * 2, c.im.hi, c.im.lo);
        setSub(nextX, zx2.hi, zx2.lo, zy2.hi, zy2.lo);
        setAdd(nextX, nextX.hi, nextX.lo, c.re.hi, c.re.lo);

        zxHi = nextX.hi;
        zxLo = nextX.lo;
        zyHi = nextY.hi;
        zyLo = nextY.lo;
    }

    setSqr(zx2, zxHi, zxLo);
    setSqr(zy2, zyHi, zyLo);

    if (escaped(zx2, zy2)) return escapedResult(maxIterations, zxHi, zxLo, zyHi, zyLo);

    return {
        status: 'bounded',
        iterations: maxIterations,
        zx: zxHi + zxLo,
        zy: zyHi + zyLo,
    };
}

type MutableDoubleDouble = {
    hi: number;
    lo: number;
};

function ddParts(): MutableDoubleDouble {
    return { hi: 0, lo: 0 };
}

function escaped(zx2: MutableDoubleDouble, zy2: MutableDoubleDouble): boolean {
    return zx2.hi + zx2.lo + zy2.hi + zy2.lo > 4;
}

function escapedResult(
    iterations: number,
    zxHi: number,
    zxLo: number,
    zyHi: number,
    zyLo: number,
): RawOrbitResult {
    const x = zxHi + zxLo;
    const y = zyHi + zyLo;

    return {
        status: 'escaped',
        iterations,
        zx: x,
        zy: y,
        smoothIteration: smoothEscapeTimeRaw(x, y, iterations),
    };
}

function setAdd(
    out: MutableDoubleDouble,
    leftHi: number,
    leftLo: number,
    rightHi: number,
    rightLo: number,
): void {
    const sumHi = leftHi + rightHi;
    const bb = sumHi - leftHi;
    const sumLo = leftHi - (sumHi - bb) + (rightHi - bb);
    setQuickTwoSum(out, sumHi, leftLo + rightLo + sumLo);
}

function setSub(
    out: MutableDoubleDouble,
    leftHi: number,
    leftLo: number,
    rightHi: number,
    rightLo: number,
): void {
    setAdd(out, leftHi, leftLo, -rightHi, -rightLo);
}

function setSqr(out: MutableDoubleDouble, valueHi: number, valueLo: number): void {
    setMul(out, valueHi, valueLo, valueHi, valueLo);
}

function setMul(
    out: MutableDoubleDouble,
    leftHi: number,
    leftLo: number,
    rightHi: number,
    rightLo: number,
): void {
    const productHi = leftHi * rightHi;
    const cLeft = SPLITTER * leftHi;
    const cRight = SPLITTER * rightHi;
    const leftHigh = cLeft - (cLeft - leftHi);
    const rightHigh = cRight - (cRight - rightHi);
    const leftLow = leftHi - leftHigh;
    const rightLow = rightHi - rightHigh;
    const productLo =
        leftHigh * rightHigh -
        productHi +
        leftHigh * rightLow +
        leftLow * rightHigh +
        leftLow * rightLow;
    const lo = leftHi * rightLo + leftLo * rightHi + productLo;

    setQuickTwoSum(out, productHi, lo);
}

function setQuickTwoSum(out: MutableDoubleDouble, hi: number, lo: number): void {
    const sum = hi + lo;
    out.hi = sum;
    out.lo = lo - (sum - hi);
}

function assertMaxIterations(maxIterations: number): void {
    if (maxIterations < 1 || !Number.isInteger(maxIterations)) {
        throw new Error('maxIterations must be a positive integer.');
    }
}
