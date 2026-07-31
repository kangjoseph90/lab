import type { NumericBackend } from './evaluate-with.js';

export type Complex = { re: number; im: number };

export type ComplexInput = number | Complex;

export const complex = (re: number, im = 0): Complex => ({ re, im });

export function isComplex(value: ComplexInput): value is Complex {
    return typeof value === 'object';
}

export function toComplex(value: ComplexInput): Complex {
    return isComplex(value) ? value : complex(value);
}

export function complexNeg(value: ComplexInput): Complex {
    const z = toComplex(value);
    return complex(-z.re, -z.im);
}

export function complexAdd(...values: ComplexInput[]): Complex {
    let re = 0;
    let im = 0;

    for (const value of values) {
        const z = toComplex(value);
        re += z.re;
        im += z.im;
    }

    return complex(re, im);
}

export function complexSub(left: ComplexInput, right: ComplexInput): Complex {
    const a = toComplex(left);
    const b = toComplex(right);
    return complex(a.re - b.re, a.im - b.im);
}

export function complexMul(...values: ComplexInput[]): Complex {
    let re = 1;
    let im = 0;

    for (const value of values) {
        const z = toComplex(value);
        const nextRe = re * z.re - im * z.im;
        const nextIm = re * z.im + im * z.re;
        re = nextRe;
        im = nextIm;
    }

    return complex(re, im);
}

export function complexDiv(left: ComplexInput, right: ComplexInput): Complex {
    const a = toComplex(left);
    const b = toComplex(right);
    const denom = b.re * b.re + b.im * b.im;
    return complex((a.re * b.re + a.im * b.im) / denom, (a.im * b.re - a.re * b.im) / denom);
}

export function complexAbs(value: ComplexInput): number {
    const z = toComplex(value);
    return Math.hypot(z.re, z.im);
}

export function complexExp(value: ComplexInput): Complex {
    const z = toComplex(value);
    const radius = Math.exp(z.re);
    return complex(radius * Math.cos(z.im), radius * Math.sin(z.im));
}

export function complexLog(value: ComplexInput): Complex {
    const z = toComplex(value);
    return complex(Math.log(complexAbs(z)), Math.atan2(z.im, z.re));
}

export function complexPow(base: ComplexInput, exp: ComplexInput): Complex {
    return complexExp(complexMul(exp, complexLog(base)));
}

export function complexSqrt(value: ComplexInput): Complex {
    const z = toComplex(value);
    const radius = complexAbs(z);
    const re = Math.sqrt((radius + z.re) / 2);
    const imSign = z.im < 0 ? -1 : 1;
    const im = imSign * Math.sqrt((radius - z.re) / 2);
    return complex(re, im);
}

export function complexSin(value: ComplexInput): Complex {
    const z = toComplex(value);
    return complex(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
}

export function complexCos(value: ComplexInput): Complex {
    const z = toComplex(value);
    return complex(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));
}

export function complexTan(value: ComplexInput): Complex {
    return complexDiv(complexSin(value), complexCos(value));
}

export function complexSinh(value: ComplexInput): Complex {
    const z = toComplex(value);
    return complex(Math.sinh(z.re) * Math.cos(z.im), Math.cosh(z.re) * Math.sin(z.im));
}

export function complexCosh(value: ComplexInput): Complex {
    const z = toComplex(value);
    return complex(Math.cosh(z.re) * Math.cos(z.im), Math.sinh(z.re) * Math.sin(z.im));
}

export function complexTanh(value: ComplexInput): Complex {
    return complexDiv(complexSinh(value), complexCosh(value));
}

export function complexAsin(value: ComplexInput): Complex {
    const z = toComplex(value);
    const iz = complex(-z.im, z.re);
    const inside = complexAdd(iz, complexSqrt(complexSub(1, complexMul(z, z))));
    const logged = complexLog(inside);
    return complex(logged.im, -logged.re);
}

export function complexAcos(value: ComplexInput): Complex {
    return complexSub(Math.PI / 2, complexAsin(value));
}

export function complexAtan(value: ComplexInput): Complex {
    const z = toComplex(value);
    const iz = complex(-z.im, z.re);
    const left = complexLog(complexSub(1, iz));
    const right = complexLog(complexAdd(1, iz));
    return complexMul(complex(0, 0.5), complexSub(left, right));
}

const complexBuiltins: Record<string, (...args: Complex[]) => Complex> = {
    abs: (value) => complex(complexAbs(value)),
    acos: complexAcos,
    asin: complexAsin,
    atan: complexAtan,
    cos: complexCos,
    cosh: complexCosh,
    exp: complexExp,
    ln: complexLog,
    log: complexLog,
    sin: complexSin,
    sinh: complexSinh,
    sqrt: complexSqrt,
    tan: complexTan,
    tanh: complexTanh,
};

export const complexBackend: NumericBackend<Complex> = {
    fromNumber: (value) => complex(value),
    neg: complexNeg,
    add: (terms) => complexAdd(...terms),
    mul: (factors) => complexMul(...factors),
    pow: complexPow,
    call: (name, args) => {
        const fn = complexBuiltins[name];

        if (!fn) {
            throw new Error(`Unknown complex function: ${name}`);
        }

        return fn(...args);
    },
};
