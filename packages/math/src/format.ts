import type { Expr } from './expr.js';
import { n } from './expr.js';

// Operator precedence. Higher binds tighter. Atoms (num/sym/call) are
// treated as `Infinity` so they never need parentheses.
function precedence(expr: Expr): number {
    switch (expr.type) {
        case 'num':
        case 'sym':
        case 'call':
            return Number.POSITIVE_INFINITY;
        case 'add':
            return 1;
        case 'mul':
            return 2;
        case 'neg':
            return 3;
        case 'pow':
            return 4;
    }
}

export function format(expr: Expr): string {
    return formatAt(expr, 0);
}

// Renders `expr`, wrapping in parentheses when its precedence is below the
// caller's binding `context`. Same-precedence children stay unparenthesized
// (left-associative + and *, right-associative ^).
function formatAt(expr: Expr, context: number): string {
    const text = render(expr);

    return precedence(expr) < context ? `(${text})` : text;
}

function render(expr: Expr): string {
    switch (expr.type) {
        case 'num':
            return String(expr.value);
        case 'sym':
            return expr.name;
        case 'neg':
            return `-${formatAt(expr.value, 3)}`;
        case 'add':
            return expr.terms
                .map((term, index) => {
                    if (index > 0 && term.type === 'num' && term.value < 0) {
                        return ` - ${formatAt(n(-term.value), 2)}`;
                    }

                    return index > 0 ? ` + ${formatAt(term, 2)}` : formatAt(term, 1);
                })
                .join('');
        case 'mul':
            return expr.factors.map((factor) => formatAt(factor, 2)).join(' * ');
        case 'pow':
            return `${formatAt(expr.base, 5)} ^ ${formatAt(expr.exp, 3)}`;
        case 'call':
            return `${expr.name}(${expr.args.map((arg) => formatAt(arg, 0)).join(', ')})`;
    }
}
