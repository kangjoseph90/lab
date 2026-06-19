import type { Expr } from './expr.js';
import { add, call, mul, n, neg, pow, s } from './expr.js';

type Token =
    | { type: 'num'; value: number; pos: number }
    | { type: 'ident'; name: string; pos: number }
    | { type: 'op'; value: Op; pos: number };

type Op = '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',';

const OPS = new Set<Op>(['+', '-', '*', '/', '^', '(', ')', ',']);

export function parse(input: string): Expr {
    const tokens = tokenize(input);
    let cursor = 0;

    const peek = (): Token | undefined => tokens[cursor];
    const advance = (): Token | undefined => tokens[cursor++];

    const isOp = (value: Op): boolean => {
        const token = peek();
        return token?.type === 'op' && token.value === value;
    };

    const expect = (value: Op): Token => {
        if (!isOp(value)) {
            const token = peek();
            throw errorAt(input, token?.pos ?? input.length, `Expected '${value}'`);
        }

        return advance()!;
    };

    const parseExpression = (): Expr => {
        let node = parseTerm();

        for (;;) {
            if (isOp('+')) {
                advance();
                node = add(node, parseTerm());
            } else if (isOp('-')) {
                advance();
                node = add(node, neg(parseTerm()));
            } else {
                return node;
            }
        }
    };

    const parseTerm = (): Expr => {
        let node = parseFactor();

        for (;;) {
            if (isOp('*')) {
                advance();
                node = mul(node, parseFactor());
            } else if (isOp('/')) {
                advance();
                node = mul(node, pow(parseFactor(), n(-1)));
            } else {
                return node;
            }
        }
    };

    const parseFactor = (): Expr => {
        if (isOp('-')) {
            advance();
            return neg(parseFactor());
        }

        return parsePower();
    };

    const parsePower = (): Expr => {
        const base = parsePrimary();

        if (isOp('^')) {
            advance();
            return pow(base, parseFactor());
        }

        return base;
    };

    const parsePrimary = (): Expr => {
        const token = peek();

        if (token === undefined) {
            throw errorAt(input, input.length, 'Unexpected end of input');
        }

        if (token.type === 'num') {
            advance();
            return n(token.value);
        }

        if (token.type === 'ident') {
            advance();

            if (isOp('(')) {
                advance();
                const args = parseArgs();
                expect(')');
                return call(token.name, ...args);
            }

            return s(token.name);
        }

        if (token.type === 'op' && token.value === '(') {
            advance();
            const node = parseExpression();
            expect(')');
            return node;
        }

        throw errorAt(input, token.pos, `Unexpected '${describe(token)}'`);
    };

    const parseArgs = (): Expr[] => {
        if (isOp(')')) return [];

        const args = [parseExpression()];

        while (isOp(',')) {
            advance();
            args.push(parseExpression());
        }

        return args;
    };

    const result = parseExpression();

    if (cursor < tokens.length) {
        const leftover = tokens[cursor]!;
        throw errorAt(input, leftover.pos, `Unexpected '${describe(leftover)}'`);
    }

    return result;
}

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];

    for (let i = 0; i < input.length; ) {
        const char = input[i]!;

        if (/\s/.test(char)) {
            i += 1;
            continue;
        }

        if (/\d/.test(char) || (char === '.' && /\d/.test(input[i + 1] ?? ''))) {
            const start = i;
            let digits = char;
            let seenDot = char === '.';
            i += 1;

            for (;;) {
                const next = input[i];

                if (next !== undefined && /\d/.test(next)) {
                    digits += next;
                    i += 1;
                    continue;
                }

                if (next === '.') {
                    if (seenDot) {
                        throw errorAt(input, i, 'Unexpected second decimal point');
                    }

                    digits += next;
                    seenDot = true;
                    i += 1;
                    continue;
                }

                break;
            }

            const value = Number.parseFloat(digits);

            if (Number.isNaN(value)) {
                throw errorAt(input, start, 'Invalid number');
            }

            tokens.push({ type: 'num', value, pos: start });
            continue;
        }

        if (/[a-zA-Z_]/.test(char)) {
            const start = i;
            let name = char;
            i += 1;

            while (i < input.length && /[a-zA-Z0-9_]/.test(input[i]!)) {
                name += input[i];
                i += 1;
            }

            tokens.push({ type: 'ident', name, pos: start });
            continue;
        }

        if (OPS.has(char as Op)) {
            tokens.push({ type: 'op', value: char as Op, pos: i });
            i += 1;
            continue;
        }

        throw errorAt(input, i, `Unexpected character '${char}'`);
    }

    return tokens;
}

function describe(token: Token): string {
    return token.type === 'op'
        ? token.value
        : token.type === 'num'
          ? token.value.toString()
          : token.name;
}

function errorAt(input: string, pos: number, message: string): Error {
    const before = input.slice(0, pos);
    const line = before.split('\n').length;
    const column = pos - before.lastIndexOf('\n');
    const caret = ' '.repeat(column - 1) + '^';

    return new Error(`${message} at ${line}:${column}\n  ${input}\n  ${caret}`);
}
