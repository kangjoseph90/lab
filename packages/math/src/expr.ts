export type Expr =
    | { type: 'num'; value: number }
    | { type: 'sym'; name: string }
    | { type: 'neg'; value: Expr }
    | { type: 'add'; terms: Expr[] }
    | { type: 'mul'; factors: Expr[] }
    | { type: 'pow'; base: Expr; exp: Expr }
    | { type: 'call'; name: string; args: Expr[] };

export const n = (value: number): Expr => ({ type: 'num', value });

export const s = (name: string): Expr => ({ type: 'sym', name });

export const neg = (value: Expr): Expr => {
    if (value.type === 'num') return n(-value.value);
    if (value.type === 'neg') return value.value;

    return { type: 'neg', value };
};

export const add = (...terms: Expr[]): Expr => {
    const flat: Expr[] = [];
    let constant = 0;

    const append = (term: Expr): void => {
        if (term.type === 'num') {
            constant += term.value;
        } else if (term.type === 'add') {
            term.terms.forEach(append);
        } else {
            flat.push(term);
        }
    };

    terms.forEach(append);

    if (constant !== 0) flat.push(n(constant));
    if (flat.length === 0) return n(0);
    if (flat.length === 1) return flat[0]!;

    return { type: 'add', terms: flat };
};

export const mul = (...factors: Expr[]): Expr => {
    const flat: Expr[] = [];
    let constant = 1;

    const append = (factor: Expr): void => {
        if (factor.type === 'num') {
            constant *= factor.value;
        } else if (factor.type === 'mul') {
            factor.factors.forEach(append);
        } else {
            flat.push(factor);
        }
    };

    factors.forEach(append);

    if (constant === 0) return n(0);
    if (constant !== 1) flat.unshift(n(constant));
    if (flat.length === 0) return n(1);
    if (flat.length === 1) return flat[0]!;

    return { type: 'mul', factors: flat };
};

export const pow = (base: Expr, exp: Expr): Expr => {
    if (base.type === 'num' && exp.type === 'num') {
        return n(base.value ** exp.value);
    }

    if (exp.type === 'num') {
        if (exp.value === 0) return n(1);
        if (exp.value === 1) return base;
    }

    if (base.type === 'num') {
        if (base.value === 1) return n(1);
        if (base.value === 0) return n(0);
    }

    return { type: 'pow', base, exp };
};

export const call = (name: string, ...args: Expr[]): Expr => ({ type: 'call', name, args });
