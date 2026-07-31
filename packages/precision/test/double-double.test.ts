import { describe, expect, it } from 'vitest';
import { compileWith, parse } from '@lab/math';
import {
    dd,
    ddAdd,
    ddDiv,
    ddMul,
    ddPowInt,
    ddSub,
    ddToNumber,
    doubleDoubleBackend,
} from '../src/index.js';

describe('double-double arithmetic', () => {
    it('preserves low-order terms through cancellation', () => {
        const value = ddSub(ddAdd(dd(1e16), dd(1)), dd(1e16));

        expect(ddToNumber(value)).toBeCloseTo(1);
    });

    it('keeps multiplication error in the low component', () => {
        const value = ddMul(dd(1e16), dd(1.0000000000000002));

        expect(value.hi).toBe(10000000000000002);
        expect(value.lo).not.toBe(0);
        expect(ddToNumber(value)).toBeCloseTo(10000000000000002);
    });

    it('divides with a correction step', () => {
        const value = ddDiv(dd(1), dd(3));
        const recovered = ddMul(value, dd(3));

        expect(ddToNumber(recovered)).toBeCloseTo(1);
    });

    it('supports integer powers', () => {
        expect(ddToNumber(ddPowInt(dd(1.5), 3))).toBeCloseTo(3.375);
        expect(ddToNumber(ddPowInt(dd(2), -2))).toBeCloseTo(0.25);
        expect(() => ddPowInt(dd(2), 0.5)).toThrow('integer');
    });

    it('can evaluate expressions through the generic math backend', () => {
        const expr = parse('(x + 1)^2 - x^2');
        const compiled = compileWith(expr, ['x'], doubleDoubleBackend);
        const result = compiled(dd(1e16));

        expect(ddToNumber(result)).toBeCloseTo(20000000000000000);
    });

    it('rejects unsupported functions clearly', () => {
        const expr = parse('sin(x)');
        const compiled = compileWith(expr, ['x'], doubleDoubleBackend);

        expect(() => compiled(dd(1))).toThrow('Unknown double-double function: sin');
    });
});
