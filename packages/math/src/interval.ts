import type { Expr } from './expr.js';

export type Interval = {
    min: number;
    max: number;
};

export type IntervalScope = Record<string, Interval>;

const ALL: Interval = { min: -Infinity, max: Infinity };

export function interval(min: number, max = min): Interval {
    if (Number.isNaN(min) || Number.isNaN(max)) return ALL;
    return min <= max ? { min, max } : { min: max, max: min };
}

export function containsZero(value: Interval): boolean {
    return value.min <= 0 && value.max >= 0;
}

export function evaluateInterval(expr: Expr, scope: IntervalScope): Interval {
    switch (expr.type) {
        case 'num':
            return interval(expr.value);
        case 'sym': {
            const value = scope[expr.name];
            if (!value) throw new Error(`Unknown symbol: ${expr.name}`);
            return value;
        }
        case 'neg': {
            const value = evaluateInterval(expr.value, scope);
            return interval(-value.max, -value.min);
        }
        case 'add':
            return expr.terms.reduce(
                (sum, term) => addIntervals(sum, evaluateInterval(term, scope)),
                interval(0),
            );
        case 'mul':
            return expr.factors.reduce(
                (product, factor) => multiplyIntervals(product, evaluateInterval(factor, scope)),
                interval(1),
            );
        case 'pow':
            return powerInterval(
                evaluateInterval(expr.base, scope),
                evaluateInterval(expr.exp, scope),
            );
        case 'call':
            return callInterval(
                expr.name,
                expr.args.map((arg) => evaluateInterval(arg, scope)),
            );
    }
}

function addIntervals(left: Interval, right: Interval): Interval {
    return interval(left.min + right.min, left.max + right.max);
}

function multiplyIntervals(left: Interval, right: Interval): Interval {
    if (isZero(left) || isZero(right)) return interval(0);

    const products = [
        left.min * right.min,
        left.min * right.max,
        left.max * right.min,
        left.max * right.max,
    ];
    if (products.some(Number.isNaN)) return ALL;
    return interval(Math.min(...products), Math.max(...products));
}

function powerInterval(base: Interval, exponent: Interval): Interval {
    if (exponent.min !== exponent.max || !Number.isInteger(exponent.min)) return ALL;

    const power = exponent.min;
    if (power === 0) return interval(1);
    if (power < 0) return reciprocal(powerInterval(base, interval(-power)));

    if (power % 2 !== 0) return interval(base.min ** power, base.max ** power);

    const maximum = Math.max(Math.abs(base.min) ** power, Math.abs(base.max) ** power);
    const minimum = containsZero(base)
        ? 0
        : Math.min(Math.abs(base.min) ** power, Math.abs(base.max) ** power);
    return interval(minimum, maximum);
}

function reciprocal(value: Interval): Interval {
    if (containsZero(value)) return ALL;
    return interval(1 / value.max, 1 / value.min);
}

function callInterval(name: string, args: Interval[]): Interval {
    const arg = args[0];
    if (!arg) return ALL;

    switch (name) {
        case 'abs':
            return containsZero(arg)
                ? interval(0, Math.max(Math.abs(arg.min), Math.abs(arg.max)))
                : interval(
                      Math.min(Math.abs(arg.min), Math.abs(arg.max)),
                      Math.max(Math.abs(arg.min), Math.abs(arg.max)),
                  );
        case 'sin':
            return periodicInterval(arg, Math.sin, Math.PI / 2, -Math.PI / 2);
        case 'cos':
            return periodicInterval(arg, Math.cos, 0, Math.PI);
        case 'tan':
            return hasPeriodicPoint(arg, Math.PI / 2, Math.PI)
                ? ALL
                : interval(Math.tan(arg.min), Math.tan(arg.max));
        case 'exp':
            return interval(Math.exp(arg.min), Math.exp(arg.max));
        case 'ln':
        case 'log':
            if (arg.max <= 0) return ALL;
            return interval(arg.min <= 0 ? -Infinity : Math.log(arg.min), Math.log(arg.max));
        case 'sqrt':
            if (arg.max < 0) return ALL;
            return interval(Math.sqrt(Math.max(0, arg.min)), Math.sqrt(arg.max));
        case 'asin':
            return monotonicDomain(arg, -1, 1, Math.asin);
        case 'acos': {
            const value = monotonicDomain(arg, -1, 1, Math.acos);
            return interval(value.max, value.min);
        }
        case 'atan':
            return interval(Math.atan(arg.min), Math.atan(arg.max));
        case 'sinh':
            return interval(Math.sinh(arg.min), Math.sinh(arg.max));
        case 'cosh': {
            const maximum = Math.max(Math.cosh(arg.min), Math.cosh(arg.max));
            const minimum = containsZero(arg)
                ? 1
                : Math.min(Math.cosh(arg.min), Math.cosh(arg.max));
            return interval(minimum, maximum);
        }
        case 'tanh':
            return interval(Math.tanh(arg.min), Math.tanh(arg.max));
        case 'floor':
            return interval(Math.floor(arg.min), Math.floor(arg.max));
        case 'ceil':
            return interval(Math.ceil(arg.min), Math.ceil(arg.max));
        case 'round':
            return interval(Math.round(arg.min), Math.round(arg.max));
        default:
            return ALL;
    }
}

function periodicInterval(
    value: Interval,
    fn: (input: number) => number,
    maximumOffset: number,
    minimumOffset: number,
): Interval {
    if (
        !Number.isFinite(value.min) ||
        !Number.isFinite(value.max) ||
        value.max - value.min >= Math.PI * 2
    ) {
        return interval(-1, 1);
    }

    const minimum = hasPeriodicPoint(value, minimumOffset, Math.PI * 2)
        ? -1
        : Math.min(fn(value.min), fn(value.max));
    const maximum = hasPeriodicPoint(value, maximumOffset, Math.PI * 2)
        ? 1
        : Math.max(fn(value.min), fn(value.max));
    return interval(minimum, maximum);
}

function hasPeriodicPoint(value: Interval, offset: number, period: number): boolean {
    if (!Number.isFinite(value.min) || !Number.isFinite(value.max)) return true;
    return Math.ceil((value.min - offset) / period) <= Math.floor((value.max - offset) / period);
}

function monotonicDomain(
    value: Interval,
    domainMin: number,
    domainMax: number,
    fn: (input: number) => number,
): Interval {
    if (value.max < domainMin || value.min > domainMax) return ALL;
    return interval(fn(Math.max(domainMin, value.min)), fn(Math.min(domainMax, value.max)));
}

function isZero(value: Interval): boolean {
    return value.min === 0 && value.max === 0;
}
