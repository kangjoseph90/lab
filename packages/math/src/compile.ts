import type { Expr } from './expr.js';
import { builtins } from './evaluate.js';

export type CompiledExpr = (...values: number[]) => number;

// builtin name -> JS source reference. Most map 1:1 to `Math.<name>`; `ln` and
// `log` both alias `Math.log`. Keys must match `builtins` in evaluate.ts, so the
// callable set stays the single source of truth and unknown names throw here.
const MATH_REF: Record<string, string> = {
    abs: 'Math.abs',
    acos: 'Math.acos',
    asin: 'Math.asin',
    atan: 'Math.atan',
    atan2: 'Math.atan2',
    ceil: 'Math.ceil',
    cos: 'Math.cos',
    cosh: 'Math.cosh',
    exp: 'Math.exp',
    floor: 'Math.floor',
    ln: 'Math.log',
    log: 'Math.log',
    round: 'Math.round',
    sin: 'Math.sin',
    sinh: 'Math.sinh',
    sqrt: 'Math.sqrt',
    tan: 'Math.tan',
    tanh: 'Math.tanh',
};

export function compile(expr: Expr, symbols: string[]): CompiledExpr {
    const symbolIndex = new Map(symbols.map((name, index) => [name, index]));

    function codegen(node: Expr): string {
        switch (node.type) {
            case 'num':
                return formatNumber(node.value);
            case 'sym': {
                const index = symbolIndex.get(node.name);

                if (index === undefined) {
                    throw new Error(`Unknown symbol: ${node.name}`);
                }

                return `a${index}`;
            }
            case 'neg':
                return `(-${codegen(node.value)})`;
            case 'add':
                return `(${node.terms.map(codegen).join(' + ')})`;
            case 'mul':
                return `(${node.factors.map(codegen).join(' * ')})`;
            case 'pow':
                return `Math.pow(${codegen(node.base)}, ${codegen(node.exp)})`;
            case 'call': {
                if (builtins[node.name] === undefined) {
                    throw new Error(`Unknown function: ${node.name}`);
                }

                const ref = MATH_REF[node.name];

                if (ref === undefined) {
                    throw new Error(`No codegen mapping for function: ${node.name}`);
                }

                return `${ref}(${node.args.map(codegen).join(', ')})`;
            }
        }
    }

    const argNames = symbols.map((_, index) => `a${index}`);
    const body = `return ${codegen(expr)};`;
    const compiled = new Function(...argNames, body) as (...args: number[]) => number;

    return (...values: number[]) => {
        if (values.length !== symbols.length) {
            throw new Error(`Expected ${symbols.length} values, received ${values.length}`);
        }

        return compiled(...values);
    };
}

function formatNumber(value: number): string {
    if (Number.isFinite(value)) return String(value);
    if (Number.isNaN(value)) return 'NaN';
    return value > 0 ? 'Infinity' : '-Infinity';
}
