import type { Expr } from './expr.js';
import { add, call, mul, neg, pow } from './expr.js';

export function simplify(expr: Expr): Expr {
    switch (expr.type) {
        case 'num':
        case 'sym':
            return expr;
        case 'neg':
            return neg(simplify(expr.value));
        case 'add':
            return add(...expr.terms.map(simplify));
        case 'mul':
            return mul(...expr.factors.map(simplify));
        case 'pow':
            return pow(simplify(expr.base), simplify(expr.exp));
        case 'call':
            return call(expr.name, ...expr.args.map(simplify));
    }
}
