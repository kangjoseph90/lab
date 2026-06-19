import type { Expr } from './expr.js';
import { builtins } from './evaluate.js';
import type { Interval, IntervalScope } from './interval.js';

export type CompiledExpr = (...values: number[]) => number;

export type CompiledInterval = (scope: IntervalScope) => Interval;

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

type BoundVars = { min: string; max: string };

export function compileInterval(expr: Expr, symbols: string[]): CompiledInterval {
    const lines: string[] = [];
    let counter = 0;
    const fresh = (): string => `t${counter++}`;

    // emit `const tNmin = ...; const tNmax = ...;` and return the var names
    const emit = (minExpr: string, maxExpr: string): BoundVars => {
        const id = fresh();
        lines.push(`const ${id}min = ${minExpr}; const ${id}max = ${maxExpr};`);
        return { min: `${id}min`, max: `${id}max` };
    };

    const literal = (value: number): BoundVars => emit(formatNumber(value), formatNumber(value));

    function codegen(node: Expr): BoundVars {
        switch (node.type) {
            case 'num':
                return literal(node.value);
            case 'sym': {
                if (!symbols.includes(node.name)) {
                    throw new Error(`Unknown symbol: ${node.name}`);
                }
                return { min: `s.${node.name}.min`, max: `s.${node.name}.max` };
            }
            case 'neg': {
                const v = codegen(node.value);
                return emit(`-${v.max}`, `-${v.min}`);
            }
            case 'add':
                return node.terms.reduce<BoundVars>((acc, term) => {
                    const v = codegen(term);
                    return emit(`${acc.min} + ${v.min}`, `${acc.max} + ${v.max}`);
                }, literal(0));
            case 'mul':
                return node.factors.reduce<BoundVars>((acc, factor) => {
                    const v = codegen(factor);
                    return multiply(acc, v);
                }, literal(1));
            case 'pow':
                return power(node);
            case 'call':
                return call(node);
        }
    }

    function multiply(left: BoundVars, right: BoundVars): BoundVars {
        const { min: lmin, max: lmax } = left;
        const { min: rmin, max: rmax } = right;
        const zeroGuard = `(${lmin} === 0 && ${lmax} === 0) || (${rmin} === 0 && ${rmax} === 0)`;
        const products = [
            `${lmin} * ${rmin}`,
            `${lmin} * ${rmax}`,
            `${lmax} * ${rmin}`,
            `${lmax} * ${rmax}`,
        ];
        const nanGuard = products.map((p) => `Number.isNaN(${p})`).join(' || ');
        return emit(
            `(${zeroGuard}) ? 0 : (${nanGuard}) ? -Infinity : Math.min(${products.join(', ')})`,
            `(${zeroGuard}) ? 0 : (${nanGuard}) ? Infinity : Math.max(${products.join(', ')})`,
        );
    }

    function power(node: Extract<Expr, { type: 'pow' }>): BoundVars {
        const { exp } = node;
        if (exp.type !== 'num' || !Number.isInteger(exp.value)) {
            throw new Error(`Unsupported interval exponent: ${formatExpr(exp)}`);
        }

        const power = exp.value;
        const base = codegen(node.base);

        if (power === 0) return literal(1);
        if (power < 0) {
            // 1 / base^|power|; undefined (ALL) when base contains zero
            const positive = powerPositive(base, -power);
            const minVar = fresh();
            const maxVar = fresh();
            lines.push(
                `const ${minVar} = (${positive.min} <= 0 && ${positive.max} >= 0) ? -Infinity : 1 / ${positive.max};`,
            );
            lines.push(
                `const ${maxVar} = (${positive.min} <= 0 && ${positive.max} >= 0) ? Infinity : 1 / ${positive.min};`,
            );
            return { min: minVar, max: maxVar };
        }

        return powerPositive(base, power);
    }

    function powerPositive(base: BoundVars, power: number): BoundVars {
        if (power % 2 !== 0) {
            return emit(`${base.min} ** ${power}`, `${base.max} ** ${power}`);
        }

        // even power: min is 0 when base crosses zero, else min of |.|^p
        const absMin = fresh();
        const absMax = fresh();
        lines.push(`const ${absMin} = Math.abs(${base.min});`);
        lines.push(`const ${absMax} = Math.abs(${base.max});`);
        const crossesZero = `${base.min} <= 0 && ${base.max} >= 0`;
        return emit(
            `${crossesZero} ? 0 : Math.min(${absMin} ** ${power}, ${absMax} ** ${power})`,
            `Math.max(${absMin} ** ${power}, ${absMax} ** ${power})`,
        );
    }

    function call(node: Extract<Expr, { type: 'call' }>): BoundVars {
        if (builtins[node.name] === undefined) {
            throw new Error(`Unknown function: ${node.name}`);
        }

        if (node.args.length !== 1) {
            throw new Error(`Unsupported interval arity for ${node.name}`);
        }

        const arg = codegen(node.args[0]!);
        const { min: amin, max: amax } = arg;

        switch (node.name) {
            case 'abs':
                return emit(
                    `${amin} <= 0 && ${amax} >= 0 ? 0 : Math.min(Math.abs(${amin}), Math.abs(${amax}))`,
                    `Math.max(Math.abs(${amin}), Math.abs(${amax}))`,
                );
            case 'exp':
                return emit(`Math.exp(${amin})`, `Math.exp(${amax})`);
            case 'ln':
            case 'log':
                return emit(
                    `${amax} <= 0 ? -Infinity : (${amin} <= 0 ? -Infinity : Math.log(${amin}))`,
                    `${amax} <= 0 ? Infinity : Math.log(${amax})`,
                );
            case 'sqrt':
                return emit(
                    `${amax} < 0 ? -Infinity : Math.sqrt(Math.max(0, ${amin}))`,
                    `${amax} < 0 ? Infinity : Math.sqrt(${amax})`,
                );
            case 'atan':
                return emit(`Math.atan(${amin})`, `Math.atan(${amax})`);
            case 'sinh':
                return emit(`Math.sinh(${amin})`, `Math.sinh(${amax})`);
            case 'tanh':
                return emit(`Math.tanh(${amin})`, `Math.tanh(${amax})`);
            case 'floor':
                return emit(`Math.floor(${amin})`, `Math.floor(${amax})`);
            case 'ceil':
                return emit(`Math.ceil(${amin})`, `Math.ceil(${amax})`);
            case 'round':
                return emit(`Math.round(${amin})`, `Math.round(${amax})`);
            case 'sin':
                return periodic(arg, 'Math.sin', 'Math.PI / 2', '-Math.PI / 2');
            case 'cos':
                return periodic(arg, 'Math.cos', '0', 'Math.PI');
            case 'tan': {
                const v = fresh();
                lines.push(
                    `const ${v} = Math.ceil((${amin} - Math.PI / 2) / Math.PI) <= Math.floor((${amax} - Math.PI / 2) / Math.PI);`,
                );
                return emit(
                    `${v} ? -Infinity : Math.tan(${amin})`,
                    `${v} ? Infinity : Math.tan(${amax})`,
                );
            }
            case 'asin':
            case 'acos': {
                const outOfDomain = `${amax} < -1 || ${amin} > 1`;
                const lo = `Math.max(-1, ${amin})`;
                const hi = `Math.min(1, ${amax})`;
                if (node.name === 'asin') {
                    return emit(
                        `${outOfDomain} ? -Infinity : Math.asin(${lo})`,
                        `${outOfDomain} ? Infinity : Math.asin(${hi})`,
                    );
                }
                return emit(
                    `${outOfDomain} ? -Infinity : Math.acos(${hi})`,
                    `${outOfDomain} ? Infinity : Math.acos(${lo})`,
                );
            }
            case 'cosh': {
                const crossesZero = `${amin} <= 0 && ${amax} >= 0`;
                return emit(
                    `${crossesZero} ? 1 : Math.min(Math.cosh(${amin}), Math.cosh(${amax}))`,
                    `Math.max(Math.cosh(${amin}), Math.cosh(${amax}))`,
                );
            }
            default:
                throw new Error(`No codegen mapping for function: ${node.name}`);
        }
    }

    function periodic(arg: BoundVars, fn: string, maxOffset: string, minOffset: string): BoundVars {
        const { min: amin, max: amax } = arg;
        const finite = `Number.isFinite(${amin}) && Number.isFinite(${amax})`;
        const wide = `${amax} - ${amin} >= Math.PI * 2`;
        const hitsMin = `Math.ceil((${amin} - (${minOffset})) / (Math.PI * 2)) <= Math.floor((${amax} - (${minOffset})) / (Math.PI * 2))`;
        const hitsMax = `Math.ceil((${amin} - (${maxOffset})) / (Math.PI * 2)) <= Math.floor((${amax} - (${maxOffset})) / (Math.PI * 2))`;
        return emit(
            `!(${finite}) || ${wide} || ${hitsMin} ? -1 : Math.min(${fn}(${amin}), ${fn}(${amax}))`,
            `!(${finite}) || ${wide} || ${hitsMax} ? 1 : Math.max(${fn}(${amin}), ${fn}(${amax}))`,
        );
    }

    const result = codegen(expr);
    lines.push(`return { min: ${result.min}, max: ${result.max} };`);

    const compiled = new Function('s', lines.join('\n')) as CompiledInterval;

    return (scope: IntervalScope): Interval => {
        for (const name of symbols) {
            if (scope[name] === undefined) {
                throw new Error(`Unknown symbol: ${name}`);
            }
        }
        return compiled(scope);
    };
}

function formatExpr(expr: Expr): string {
    return expr.type === 'num' ? String(expr.value) : expr.type;
}
