import type { Expr } from './expr.js';
import { add, call, mul, neg, pow } from './expr.js';

export type Substitutions = Record<string, Expr>;

export function substitute(expr: Expr, substitutions: Substitutions): Expr {
    switch (expr.type) {
        case 'num':
            return expr;
        case 'sym':
            return substitutions[expr.name] ?? expr;
        case 'neg':
            return neg(substitute(expr.value, substitutions));
        case 'add':
            return add(...expr.terms.map((term) => substitute(term, substitutions)));
        case 'mul':
            return mul(...expr.factors.map((factor) => substitute(factor, substitutions)));
        case 'pow':
            return pow(substitute(expr.base, substitutions), substitute(expr.exp, substitutions));
        case 'call':
            return call(expr.name, ...expr.args.map((arg) => substitute(arg, substitutions)));
    }
}
