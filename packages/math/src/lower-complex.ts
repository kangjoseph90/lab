import type { Expr } from './expr.js';
import { add, call, mul, n, neg, pow, s } from './expr.js';
import { simplify } from './simplify.js';

export type LoweredComplex = {
    re: Expr;
    im: Expr;
};

export type LowerComplexOptions = {
    symbol?: string;
    real?: string;
    imag?: string;
};

type LowerContext = Required<LowerComplexOptions>;

export function lowerComplex(expr: Expr, options: LowerComplexOptions = {}): LoweredComplex {
    const context: LowerContext = {
        symbol: options.symbol ?? 'z',
        real: options.real ?? 'x',
        imag: options.imag ?? 'y',
    };

    return lower(expr, context);
}

export function lowerComplexScalar(expr: Expr, options: LowerComplexOptions = {}): Expr {
    const lowered = lowerComplex(expr, options);

    if (!isZero(lowered.im)) {
        throw new Error(
            'Complex expression must be real-valued. Use re(...), im(...), or abs(...).',
        );
    }

    return simplify(lowered.re);
}

function lower(expr: Expr, context: LowerContext): LoweredComplex {
    switch (expr.type) {
        case 'num':
            return real(expr);
        case 'sym':
            return expr.name === context.symbol
                ? { re: s(context.real), im: s(context.imag) }
                : real(expr);
        case 'neg': {
            const value = lower(expr.value, context);
            return { re: neg(value.re), im: neg(value.im) };
        }
        case 'add':
            return expr.terms.map((term) => lower(term, context)).reduce(addPair, real(n(0)));
        case 'mul':
            return expr.factors.map((factor) => lower(factor, context)).reduce(mulPair, real(n(1)));
        case 'pow':
            return lowerPow(expr, context);
        case 'call':
            return lowerCall(expr, context);
    }
}

function lowerPow(expr: Extract<Expr, { type: 'pow' }>, context: LowerContext): LoweredComplex {
    const base = lower(expr.base, context);
    const exp = lower(expr.exp, context);

    if (isZero(base.im) && isZero(exp.im)) {
        return real(pow(base.re, expr.exp));
    }

    if (!isZero(exp.im)) {
        throw new Error('Complex power lowering requires a real exponent.');
    }

    if (expr.exp.type !== 'num' || !Number.isInteger(expr.exp.value)) {
        throw new Error('Complex power lowering only supports integer exponents.');
    }

    const exponent = expr.exp.value;

    if (exponent === 0) return real(n(1));
    if (exponent < 0) return divPair(real(n(1)), powPositive(base, -exponent));

    return powPositive(base, exponent);
}

function powPositive(base: LoweredComplex, exponent: number): LoweredComplex {
    let result = real(n(1));

    for (let i = 0; i < exponent; i += 1) {
        result = mulPair(result, base);
    }

    return result;
}

function lowerCall(expr: Extract<Expr, { type: 'call' }>, context: LowerContext): LoweredComplex {
    if (expr.args.length !== 1) {
        throw new Error(`Cannot lower complex function with multiple args: ${expr.name}`);
    }

    const arg = lower(expr.args[0]!, context);

    switch (expr.name) {
        case 're':
            return real(arg.re);
        case 'im':
            return real(arg.im);
        case 'conj':
            return { re: arg.re, im: neg(arg.im) };
        case 'abs':
            return real(call('sqrt', add(pow(arg.re, n(2)), pow(arg.im, n(2)))));
        case 'arg':
            throw new Error('Complex arg lowering is not supported yet.');
        case 'exp':
            return {
                re: mul(call('exp', arg.re), call('cos', arg.im)),
                im: mul(call('exp', arg.re), call('sin', arg.im)),
            };
        case 'ln':
        case 'log':
            return {
                re: call('ln', call('sqrt', add(pow(arg.re, n(2)), pow(arg.im, n(2))))),
                im: call('atan2', arg.im, arg.re),
            };
        case 'sqrt':
            if (isZero(arg.im)) return real(call('sqrt', arg.re));
            throw new Error('Complex sqrt lowering is not supported yet.');
        case 'sin':
            return {
                re: mul(call('sin', arg.re), call('cosh', arg.im)),
                im: mul(call('cos', arg.re), call('sinh', arg.im)),
            };
        case 'cos':
            return {
                re: mul(call('cos', arg.re), call('cosh', arg.im)),
                im: neg(mul(call('sin', arg.re), call('sinh', arg.im))),
            };
        case 'tan':
            return divPair(
                lowerCall({ type: 'call', name: 'sin', args: [expr.args[0]!] }, context),
                lowerCall({ type: 'call', name: 'cos', args: [expr.args[0]!] }, context),
            );
        case 'sinh':
            return {
                re: mul(call('sinh', arg.re), call('cos', arg.im)),
                im: mul(call('cosh', arg.re), call('sin', arg.im)),
            };
        case 'cosh':
            return {
                re: mul(call('cosh', arg.re), call('cos', arg.im)),
                im: mul(call('sinh', arg.re), call('sin', arg.im)),
            };
        case 'tanh':
            return divPair(
                lowerCall({ type: 'call', name: 'sinh', args: [expr.args[0]!] }, context),
                lowerCall({ type: 'call', name: 'cosh', args: [expr.args[0]!] }, context),
            );
        default:
            if (isZero(arg.im)) {
                return real(call(expr.name, arg.re));
            }

            throw new Error(`Cannot lower complex function: ${expr.name}`);
    }
}

function real(re: Expr): LoweredComplex {
    return { re, im: n(0) };
}

function addPair(left: LoweredComplex, right: LoweredComplex): LoweredComplex {
    return {
        re: add(left.re, right.re),
        im: add(left.im, right.im),
    };
}

function mulPair(left: LoweredComplex, right: LoweredComplex): LoweredComplex {
    return {
        re: add(mul(left.re, right.re), neg(mul(left.im, right.im))),
        im: add(mul(left.re, right.im), mul(left.im, right.re)),
    };
}

function divPair(left: LoweredComplex, right: LoweredComplex): LoweredComplex {
    const denom = add(pow(right.re, n(2)), pow(right.im, n(2)));

    return {
        re: mul(add(mul(left.re, right.re), mul(left.im, right.im)), pow(denom, n(-1))),
        im: mul(add(mul(left.im, right.re), neg(mul(left.re, right.im))), pow(denom, n(-1))),
    };
}

function isZero(expr: Expr): boolean {
    const simplified = simplify(expr);
    return simplified.type === 'num' && simplified.value === 0;
}
