import type { Expr } from './expr.js';
import { builtins } from './evaluate.js';

export type EvaluationScope<T> = Record<string, T>;

export type NumericBackend<T> = {
    fromNumber(value: number): T;
    neg(value: T): T;
    add(terms: readonly T[]): T;
    mul(factors: readonly T[]): T;
    pow(base: T, exp: T): T;
    call(name: string, args: readonly T[]): T;
};

export type CompiledWithExpr<T> = (...values: T[]) => T;

export const numberBackend: NumericBackend<number> = {
    fromNumber: (value) => value,
    neg: (value) => -value,
    add: (terms) => terms.reduce((sum, term) => sum + term, 0),
    mul: (factors) => factors.reduce((product, factor) => product * factor, 1),
    pow: (base, exp) => base ** exp,
    call: (name, args) => {
        const fn = builtins[name];

        if (!fn) {
            throw new Error(`Unknown function: ${name}`);
        }

        return fn(...args);
    },
};

export function evaluateWith<T>(
    expr: Expr,
    scope: EvaluationScope<T>,
    backend: NumericBackend<T>,
): T {
    switch (expr.type) {
        case 'num':
            return backend.fromNumber(expr.value);
        case 'sym': {
            const value = scope[expr.name];

            if (value === undefined) {
                throw new Error(`Unknown symbol: ${expr.name}`);
            }

            return value;
        }
        case 'neg':
            return backend.neg(evaluateWith(expr.value, scope, backend));
        case 'add':
            return backend.add(expr.terms.map((term) => evaluateWith(term, scope, backend)));
        case 'mul':
            return backend.mul(expr.factors.map((factor) => evaluateWith(factor, scope, backend)));
        case 'pow':
            return backend.pow(
                evaluateWith(expr.base, scope, backend),
                evaluateWith(expr.exp, scope, backend),
            );
        case 'call':
            return backend.call(
                expr.name,
                expr.args.map((arg) => evaluateWith(arg, scope, backend)),
            );
    }
}

export function compileWith<T>(
    expr: Expr,
    symbols: readonly string[],
    backend: NumericBackend<T>,
): CompiledWithExpr<T> {
    const symbolIndex = new Map(symbols.map((name, index) => [name, index]));

    function compileNode(node: Expr): (values: readonly T[]) => T {
        switch (node.type) {
            case 'num':
                return () => backend.fromNumber(node.value);
            case 'sym': {
                const index = symbolIndex.get(node.name);

                if (index === undefined) {
                    throw new Error(`Unknown symbol: ${node.name}`);
                }

                return (values) => values[index]!;
            }
            case 'neg': {
                const value = compileNode(node.value);
                return (values) => backend.neg(value(values));
            }
            case 'add': {
                const terms = node.terms.map(compileNode);
                return (values) => backend.add(terms.map((term) => term(values)));
            }
            case 'mul': {
                const factors = node.factors.map(compileNode);
                return (values) => backend.mul(factors.map((factor) => factor(values)));
            }
            case 'pow': {
                const base = compileNode(node.base);
                const exp = compileNode(node.exp);
                return (values) => backend.pow(base(values), exp(values));
            }
            case 'call': {
                const args = node.args.map(compileNode);
                return (values) =>
                    backend.call(
                        node.name,
                        args.map((arg) => arg(values)),
                    );
            }
        }
    }

    const compiled = compileNode(expr);

    return (...values: T[]) => {
        if (values.length !== symbols.length) {
            throw new Error(`Expected ${symbols.length} values, received ${values.length}`);
        }

        return compiled(values);
    };
}
