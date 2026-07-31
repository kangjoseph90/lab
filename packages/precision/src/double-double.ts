import type { NumericBackend } from '@lab/math';

export type DoubleDouble = {
    hi: number;
    lo: number;
};

const SPLITTER = 134217729;

export function dd(value: number): DoubleDouble {
    return { hi: value, lo: 0 };
}

export function ddNormalize(hi: number, lo: number): DoubleDouble {
    const sum = hi + lo;
    return { hi: sum, lo: lo - (sum - hi) };
}

export function ddAdd(left: DoubleDouble, right: DoubleDouble): DoubleDouble {
    const sum = twoSum(left.hi, right.hi);
    const lo = left.lo + right.lo + sum.lo;
    return quickTwoSum(sum.hi, lo);
}

export function ddNeg(value: DoubleDouble): DoubleDouble {
    return { hi: -value.hi, lo: -value.lo };
}

export function ddSub(left: DoubleDouble, right: DoubleDouble): DoubleDouble {
    return ddAdd(left, ddNeg(right));
}

export function ddMul(left: DoubleDouble, right: DoubleDouble): DoubleDouble {
    const product = twoProduct(left.hi, right.hi);
    const lo = left.hi * right.lo + left.lo * right.hi + product.lo;
    return quickTwoSum(product.hi, lo);
}

export function ddSqr(value: DoubleDouble): DoubleDouble {
    return ddMul(value, value);
}

export function ddDiv(left: DoubleDouble, right: DoubleDouble): DoubleDouble {
    const estimate = left.hi / right.hi;
    const product = ddMul(right, dd(estimate));
    const correction = ddSub(left, product);
    return ddAdd(dd(estimate), dd(correction.hi / right.hi));
}

export function ddPowInt(base: DoubleDouble, exponent: number): DoubleDouble {
    if (!Number.isInteger(exponent)) {
        throw new Error('Double-double exponent must be an integer.');
    }

    if (exponent === 0) return dd(1);
    if (exponent < 0) return ddDiv(dd(1), ddPowInt(base, -exponent));

    let result = dd(1);
    let factor = base;
    let power = exponent;

    while (power > 0) {
        if (power % 2 === 1) result = ddMul(result, factor);
        factor = ddSqr(factor);
        power = Math.floor(power / 2);
    }

    return result;
}

export function ddToNumber(value: DoubleDouble): number {
    return value.hi + value.lo;
}

export const doubleDoubleBackend: NumericBackend<DoubleDouble> = {
    fromNumber: dd,
    neg: ddNeg,
    add: (terms) => terms.reduce((sum, term) => ddAdd(sum, term), dd(0)),
    mul: (factors) => factors.reduce((product, factor) => ddMul(product, factor), dd(1)),
    pow: (base, exp) => ddPowInt(base, ddToNumber(exp)),
    call: (name, args) => {
        switch (name) {
            case 'abs':
                return dd(Math.abs(ddToNumber(args[0]!)));
            case 'sqrt':
                return dd(Math.sqrt(ddToNumber(args[0]!)));
            default:
                throw new Error(`Unknown double-double function: ${name}`);
        }
    },
};

function quickTwoSum(a: number, b: number): DoubleDouble {
    const hi = a + b;
    return { hi, lo: b - (hi - a) };
}

function twoSum(a: number, b: number): DoubleDouble {
    const hi = a + b;
    const bb = hi - a;
    return { hi, lo: a - (hi - bb) + (b - bb) };
}

function twoProduct(a: number, b: number): DoubleDouble {
    const hi = a * b;
    const aSplit = split(a);
    const bSplit = split(b);
    const lo =
        aSplit.hi * bSplit.hi -
        hi +
        aSplit.hi * bSplit.lo +
        aSplit.lo * bSplit.hi +
        aSplit.lo * bSplit.lo;

    return { hi, lo };
}

function split(value: number): DoubleDouble {
    const c = SPLITTER * value;
    const hi = c - (c - value);
    return { hi, lo: value - hi };
}
