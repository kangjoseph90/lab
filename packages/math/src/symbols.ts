import type { Expr } from './expr.js';

export function collectSymbols(expr: Expr): Set<string> {
    const symbols = new Set<string>();
    visit(expr, symbols);
    return symbols;
}

function visit(expr: Expr, symbols: Set<string>): void {
    switch (expr.type) {
        case 'num':
            return;
        case 'sym':
            symbols.add(expr.name);
            return;
        case 'neg':
            visit(expr.value, symbols);
            return;
        case 'add':
            expr.terms.forEach((term) => visit(term, symbols));
            return;
        case 'mul':
            expr.factors.forEach((factor) => visit(factor, symbols));
            return;
        case 'pow':
            visit(expr.base, symbols);
            visit(expr.exp, symbols);
            return;
        case 'call':
            expr.args.forEach((arg) => visit(arg, symbols));
            return;
    }
}
