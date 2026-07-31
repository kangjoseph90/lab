import type { DoubleDouble } from '@lab/precision';

export function splitFloat(value: number): { hi: number; lo: number } {
    const hi = Math.fround(value);
    return { hi, lo: Math.fround(value - hi) };
}

export function splitDoubleDoubleForGpu(value: DoubleDouble): { hi: number; lo: number } {
    const hi = Math.fround(value.hi);
    return { hi, lo: Math.fround(value.hi - hi + value.lo) };
}
