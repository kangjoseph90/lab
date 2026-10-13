import type { DoubleDouble } from '@lab/precision';
import type { FractalViewport } from '../viewport';
import type { FractalConfig, FractalPrecision } from './renderer';
import { smoothEscapeTimeRaw } from '@lab/fractal';
import type { RawOrbitResult } from '@lab/fractal';

export type PrecisePoint = { x: bigint; y: bigint; bits: number };

/** DD reference rounding becomes visible before its coordinate resolution is exhausted. */
export function deepZoomArithmetic(view: FractalViewport, precision: FractalPrecision) {
    const scale = Math.abs(view.unitsPerPixel.hi + view.unitsPerPixel.lo);
    return precision === 'double-double' && scale > 0 && scale < 1e-20
        ? new DeepZoomArithmetic(view)
        : undefined;
}

/** Fixed-point references and glitch retries, with 80 guard bits below one screen pixel. */
export class DeepZoomArithmetic {
    readonly bits: number;
    readonly #unit: bigint;
    readonly #view: FractalViewport;
    readonly #float = new DataView(new ArrayBuffer(8));

    constructor(view: FractalViewport) {
        this.#view = view;
        this.bits = Math.max(
            160,
            Math.ceil(-Math.log2(Math.abs(view.unitsPerPixel.hi + view.unitsPerPixel.lo))) + 80,
        );
        this.#unit = this.#fromDD(view.unitsPerPixel);
    }

    point(pixelX: number, pixelY: number, width: number, height: number): PrecisePoint {
        return {
            x:
                this.#fromDD(this.#view.centerX) +
                this.#mul(this.#fromNumber(pixelX - width / 2), this.#unit),
            y:
                this.#fromDD(this.#view.centerY) -
                this.#mul(this.#fromNumber(pixelY - height / 2), this.#unit),
            bits: this.bits,
        };
    }

    project(point: PrecisePoint, width: number, height: number) {
        if (point.bits !== this.bits) throw new Error('Reference precision mismatch.');
        return {
            pixelX:
                width / 2 + Number(point.x - this.#fromDD(this.#view.centerX)) / Number(this.#unit),
            pixelY:
                height / 2 -
                Number(point.y - this.#fromDD(this.#view.centerY)) / Number(this.#unit),
        };
    }

    iterate(
        point: PrecisePoint,
        maxIterations: number,
        fractal: FractalConfig,
        visit?: (iteration: number, x: DoubleDouble, y: DoubleDouble) => void,
    ): RawOrbitResult {
        const julia = fractal.type === 'julia';
        const cx = julia ? this.#fromNumber(fractal.c.re) : point.x;
        const cy = julia ? this.#fromNumber(fractal.c.im) : point.y;
        let zx = julia ? point.x : 0n;
        let zy = julia ? point.y : 0n;
        const bailout = 4n << BigInt(2 * this.bits);
        for (let iterations = 0; iterations <= maxIterations; iterations++) {
            visit?.(iterations, this.#toDD(zx), this.#toDD(zy));
            const x2 = zx * zx;
            const y2 = zy * zy;
            if (x2 + y2 > bailout) {
                const x = this.#toNumber(zx),
                    y = this.#toNumber(zy);
                return {
                    status: 'escaped',
                    iterations,
                    zx: x,
                    zy: y,
                    smoothIteration: smoothEscapeTimeRaw(x, y, iterations),
                };
            }
            if (iterations === maxIterations) {
                return {
                    status: 'bounded',
                    iterations,
                    zx: this.#toNumber(zx),
                    zy: this.#toNumber(zy),
                };
            }
            const nextX = ((x2 - y2) >> BigInt(this.bits)) + cx;
            zy = ((2n * zx * zy) >> BigInt(this.bits)) + cy;
            zx = nextX;
        }
        throw new Error('Invalid iteration limit.');
    }

    #mul(a: bigint, b: bigint) {
        return (a * b) >> BigInt(this.bits);
    }
    #fromDD(value: DoubleDouble) {
        return this.#fromNumber(value.hi) + this.#fromNumber(value.lo);
    }
    #fromNumber(value: number): bigint {
        if (!Number.isFinite(value)) throw new Error('Non-finite fractal coordinate.');
        this.#float.setFloat64(0, value);
        const raw = this.#float.getBigUint64(0);
        const exponent = Number((raw >> 52n) & 0x7ffn);
        let mantissa = raw & ((1n << 52n) - 1n);
        if (exponent !== 0) mantissa |= 1n << 52n;
        const shift = this.bits + (exponent === 0 ? -1074 : exponent - 1023 - 52);
        const scaled = shift < 0 ? mantissa >> BigInt(-shift) : mantissa << BigInt(shift);
        return raw >> 63n ? -scaled : scaled;
    }
    #toNumber(value: bigint): number {
        const negative = value < 0n;
        const magnitude = negative ? -value : value;
        const shift = Math.max(0, magnitude.toString(2).length - 54);
        const exponent = shift - this.bits;
        const result =
            Number(magnitude >> BigInt(shift)) *
            2 ** Math.max(-1022, exponent) *
            2 ** Math.min(0, exponent + 1022);
        return negative ? -result : result;
    }
    #toDD(value: bigint): DoubleDouble {
        const hi = this.#toNumber(value);
        return { hi, lo: this.#toNumber(value - this.#fromNumber(hi)) };
    }
}
