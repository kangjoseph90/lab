import type { Expr } from './expr.js';
import { add, call, mul, n, neg, pow } from './expr.js';
import { simplify } from './simplify.js';

export function differentiate(expr: Expr, symbol: string): Expr {
    return simplify(diff(expr, symbol));
}

function diff(expr: Expr, symbol: string): Expr {
    switch (expr.type) {
        case 'num':
            return n(0);
        case 'sym':
            return n(expr.name === symbol ? 1 : 0);
        case 'neg':
            return neg(diff(expr.value, symbol));
        case 'add':
            return add(...expr.terms.map((term) => diff(term, symbol)));
        case 'mul':
            return add(
                ...expr.factors.map((factor, index) =>
                    mul(
                        ...expr.factors.map((item, itemIndex) =>
                            itemIndex === index ? diff(factor, symbol) : item,
                        ),
                    ),
                ),
            );
        case 'pow':
            return mul(
                expr,
                add(
                    mul(diff(expr.exp, symbol), call('ln', expr.base)),
                    mul(expr.exp, diff(expr.base, symbol), pow(expr.base, n(-1))),
                ),
            );
        case 'call':
            return diffCall(expr, symbol);
    }
}

function diffCall(expr: Extract<Expr, { type: 'call' }>, symbol: string): Expr {
    if (expr.args.length !== 1) {
        throw new Error(`Cannot differentiate function with multiple args: ${expr.name}`);
    }

    const [arg] = expr.args;
    const argDiff = diff(arg!, symbol);

    switch (expr.name) {
        case 'sin':
            return mul(call('cos', arg!), argDiff);
        case 'cos':
            return mul(neg(call('sin', arg!)), argDiff);
        case 'tan':
            return mul(pow(call('cos', arg!), n(-2)), argDiff);
        case 'asin':
            return mul(argDiff, pow(call('sqrt', add(n(1), neg(pow(arg!, n(2))))), n(-1)));
        case 'acos':
            return mul(neg(argDiff), pow(call('sqrt', add(n(1), neg(pow(arg!, n(2))))), n(-1)));
        case 'atan':
            return mul(argDiff, pow(add(n(1), pow(arg!, n(2))), n(-1)));
        case 'exp':
            return mul(call('exp', arg!), argDiff);
        case 'ln':
        case 'log':
            return mul(argDiff, pow(arg!, n(-1)));
        case 'sqrt':
            return mul(n(0.5), pow(arg!, n(-0.5)), argDiff);
        case 'sinh':
            return mul(call('cosh', arg!), argDiff);
        case 'cosh':
            return mul(call('sinh', arg!), argDiff);
        case 'tanh':
            return mul(argDiff, pow(call('cosh', arg!), n(-2)));
        default:
            throw new Error(`Cannot differentiate function: ${expr.name}`);
    }
}
