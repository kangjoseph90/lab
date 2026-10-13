import { differentiate } from '@lab/math';
import type { Expr } from '@lab/math';
import type { Equation } from '../equation';
import { GRAPH_GPU_HELPERS, GRAPH_GPU_RENDER } from './gpu-shader-source';

export const GRAPH_WORKGROUP_SIZE = 8;
const GPU_LIMIT = 1e30;
const FUNCTIONS = new Set([
    'abs',
    'acos',
    'asin',
    'atan',
    'ceil',
    'cos',
    'cosh',
    'exp',
    'floor',
    'log',
    'round',
    'sin',
    'sinh',
    'sqrt',
    'tan',
    'tanh',
]);

function literal(value: number): string {
    if (
        !Number.isFinite(value) ||
        Math.abs(value) > GPU_LIMIT ||
        (value !== 0 && Math.abs(value) < 1e-30)
    ) {
        throw new Error('This constant exceeds GPU precision. Select CPU to render this equation.');
    }
    return `${Math.fround(value).toExponential(9)}f`;
}

// Generate straight-line code once per equation. Shared subexpressions are
// evaluated once, and invalid domains are rejected before invoking WGSL math.
function scalarFunction(name: string, expr: Expr): string {
    const lines: string[] = [];
    const cache = new Map<string, string>();
    let count = 0;
    function emit(node: Expr): string {
        const key = JSON.stringify(node);
        const cached = cache.get(key);
        if (cached) return cached;
        let code: string;
        switch (node.type) {
            case 'num':
                return `sample(${literal(node.value)})`;
            case 'sym':
                if (node.name !== 'x' && node.name !== 'y')
                    throw new Error(`Unknown symbol: ${node.name}`);
                return `sample(${node.name})`;
            case 'neg':
                code = `sample(-${emit(node.value)}.value)`;
                break;
            case 'add':
            case 'mul': {
                const nodes = node.type === 'add' ? node.terms : node.factors;
                const operation = node.type === 'add' ? 'scalar_add' : 'scalar_mul';
                let result = `sample(${node.type === 'add' ? '0.0' : '1.0'})`;
                for (const child of nodes) {
                    const operand = emit(child);
                    const id = `t${count++}`;
                    lines.push(
                        `let ${id} = ${operation}(${result}, ${operand});`,
                        `if (!${id}.valid) { return invalid(); }`,
                    );
                    result = id;
                }
                cache.set(key, result);
                return result;
            }
            case 'pow': {
                const base = emit(node.base);
                if (node.exp.type === 'num' && Number.isInteger(node.exp.value)) {
                    if (Math.abs(node.exp.value) > 2147483647)
                        throw new Error('GPU integer exponent is too large. Select CPU.');
                    code = `scalar_pow_int(${base}, ${node.exp.value}i)`;
                } else {
                    code = `scalar_pow(${base}, ${emit(node.exp)})`;
                }
                break;
            }
            case 'call': {
                const fn = node.name === 'ln' ? 'log' : node.name;
                if (!FUNCTIONS.has(fn) || node.args.length !== 1)
                    throw new Error(
                        `GPU does not support ${node.name} with ${node.args.length} arguments. Select CPU.`,
                    );
                const arg = emit(node.args[0]!);
                if (fn === 'log') lines.push(`if (${arg}.value <= 0.0) { return invalid(); }`);
                if (fn === 'sqrt') lines.push(`if (${arg}.value < 0.0) { return invalid(); }`);
                if (fn === 'asin' || fn === 'acos')
                    lines.push(`if (abs(${arg}.value) > 1.0) { return invalid(); }`);
                if (fn === 'exp') lines.push(`if (abs(${arg}.value) > 69.0) { return invalid(); }`);
                if (fn === 'sinh' || fn === 'cosh')
                    lines.push(`if (abs(${arg}.value) > 69.0) { return invalid(); }`);
                code =
                    fn === 'round'
                        ? `sample(floor(${arg}.value + 0.5))`
                        : `sample(${fn}(${arg}.value))`;
                break;
            }
        }
        const id = `t${count++}`;
        lines.push(`let ${id} = ${code};`, `if (!${id}.valid) { return invalid(); }`);
        cache.set(key, id);
        return id;
    }
    const result = emit(expr);
    return `fn ${name}(x: f32, y: f32) -> Sample {\n${lines.join('\n')}\nreturn ${result};\n}`;
}

function intervalFunction(expr: Expr): string {
    const lines: string[] = [];
    let count = 0;
    function emit(node: Expr): string {
        let code: string;
        switch (node.type) {
            case 'num':
                return `vec2f(${literal(node.value)})`;
            case 'sym':
                if (node.name !== 'x' && node.name !== 'y')
                    throw new Error(`Unknown symbol: ${node.name}`);
                return node.name;
            case 'neg':
                code = `-${emit(node.value)}.yx`;
                break;
            case 'add':
            case 'mul': {
                const nodes = node.type === 'add' ? node.terms : node.factors;
                const op = node.type === 'add' ? 'range_add' : 'range_mul';
                let result = `vec2f(${node.type === 'add' ? '0.0' : '1.0'})`;
                for (const child of nodes) {
                    const operand = emit(child);
                    const id = `r${count++}`;
                    lines.push(`let ${id} = ${op}(${result}, ${operand});`);
                    result = id;
                }
                return result;
            }
            case 'pow':
                if (
                    node.exp.type !== 'num' ||
                    !Number.isInteger(node.exp.value) ||
                    Math.abs(node.exp.value) > 2147483647
                )
                    throw new Error('GPU interval exponents must be integers. Select CPU.');
                code = `range_pow(${emit(node.base)}, ${node.exp.value}i)`;
                break;
            case 'call': {
                const fn = node.name === 'ln' ? 'log' : node.name;
                if (!FUNCTIONS.has(fn) || node.args.length !== 1)
                    throw new Error(`GPU interval function is unsupported: ${node.name}`);
                code = `range_${fn}(${emit(node.args[0]!)})`;
                break;
            }
        }
        const id = `r${count++}`;
        lines.push(`let ${id} = ${code};`);
        return id;
    }
    const result = emit(expr);
    return `fn equation_range(x: vec2f, y: vec2f) -> vec2f {\n${lines.join('\n')}\nreturn ${result};\n}`;
}

export function createGraphShader(equation: Equation): string {
    const relation = { eq: 0, lt: 1, lte: 2, gt: 3, gte: 4 }[equation.relation];
    return [
        `const RELATION: u32 = ${relation}u;`,
        GRAPH_GPU_HELPERS,
        scalarFunction('equation_value', equation.expr),
        scalarFunction('equation_dx', differentiate(equation.expr, 'x')),
        scalarFunction('equation_dy', differentiate(equation.expr, 'y')),
        intervalFunction(equation.expr),
        GRAPH_GPU_RENDER,
    ].join('\n');
}
