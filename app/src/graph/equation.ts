import {
    add,
    collectSymbols,
    compile,
    compileInterval,
    differentiate,
    lowerComplexScalar,
    neg,
    parse,
} from '@lab/math';
import type { CompiledExpr, CompiledInterval, Expr } from '@lab/math';

export type Relation = 'eq' | 'lt' | 'lte' | 'gt' | 'gte';

export type Equation = {
    expr: Expr;
    relation: Relation;
};

export type CompiledEquation = Equation & {
    value: CompiledExpr;
    dx: CompiledExpr;
    dy: CompiledExpr;
    interval: CompiledInterval;
};

const RELATIONS: Record<string, Relation> = {
    '=': 'eq',
    '<': 'lt',
    '<=': 'lte',
    '>': 'gt',
    '>=': 'gte',
};

export function parseEquation(input: string): Equation {
    const matches = [...input.matchAll(/<=|>=|=|<|>/g)];

    if (matches.length > 1) {
        throw new Error('An equation can contain only one relation.');
    }

    const match = matches[0];
    const operator = match?.[0];
    const index = match?.index;
    const left = index === undefined ? input.trim() : input.slice(0, index).trim();
    const right = index === undefined ? undefined : input.slice(index + operator!.length).trim();

    if (!left) throw new Error('Enter an expression.');
    if (operator && !right) throw new Error('Enter the right side of the equation.');

    const parsed = right ? add(parse(left), neg(parse(right))) : parse(left);
    const symbols = [...collectSymbols(parsed)];
    const unknown = symbols.filter((name) => name !== 'x' && name !== 'y' && name !== 'z');

    if (unknown.length > 0) {
        throw new Error(`Unknown symbol${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
    }

    const usesRealCoordinates = symbols.includes('x') || symbols.includes('y');
    const usesComplexCoordinate = symbols.includes('z');

    if (usesRealCoordinates && usesComplexCoordinate) {
        throw new Error('Use either x/y or z, not both.');
    }

    const expr = usesComplexCoordinate ? lowerComplexScalar(parsed) : parsed;

    return { expr, relation: operator ? RELATIONS[operator]! : 'eq' };
}

export function compileEquation(input: string): CompiledEquation {
    const equation = parseEquation(input);

    return compileEquationExpr(equation);
}

export function compileEquationExpr(equation: Equation): CompiledEquation {
    const { expr, relation } = equation;

    return {
        expr,
        relation,
        value: compile(expr, ['x', 'y']),
        dx: compile(differentiate(expr, 'x'), ['x', 'y']),
        dy: compile(differentiate(expr, 'y'), ['x', 'y']),
        interval: compileInterval(expr, ['x', 'y']),
    };
}
