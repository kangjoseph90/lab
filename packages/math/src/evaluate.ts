import type { Expr } from './expr.js';

export type Scope = Record<string, number>;

export const builtins: Record<string, (...args: number[]) => number> = {
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    atan2: Math.atan2,
    ceil: Math.ceil,
    cos: Math.cos,
    cosh: Math.cosh,
    exp: Math.exp,
    floor: Math.floor,
    ln: Math.log,
    log: Math.log,
    round: Math.round,
    sin: Math.sin,
    sinh: Math.sinh,
    sqrt: Math.sqrt,
    tan: Math.tan,
    tanh: Math.tanh,
};

export function evaluate(expr: Expr, scope: Scope = {}): number {
    switch (expr.type) {
        case 'num':
            return expr.value;
        case 'sym': {
            const value = scope[expr.name];

            if (value === undefined) {
                throw new Error(`Unknown symbol: ${expr.name}`);
            }

            return value;
        }
        case 'neg':
            return -evaluate(expr.value, scope);
        case 'add':
            return expr.terms.reduce((sum, term) => sum + evaluate(term, scope), 0);
        case 'mul':
            return expr.factors.reduce((product, factor) => product * evaluate(factor, scope), 1);
        case 'pow':
            return evaluate(expr.base, scope) ** evaluate(expr.exp, scope);
        case 'call': {
            const fn = builtins[expr.name];

            if (!fn) {
                throw new Error(`Unknown function: ${expr.name}`);
            }

            return fn(...expr.args.map((arg) => evaluate(arg, scope)));
        }
    }
}
