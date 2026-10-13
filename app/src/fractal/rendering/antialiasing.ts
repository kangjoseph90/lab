export type FractalAntialiasing = 1 | 4 | 9;
export type SampleOffset = readonly [number, number];

const OFF: readonly SampleOffset[] = [[0, 0]];
const FOUR: readonly SampleOffset[] = [
    [-0.25, -0.25],
    [0.25, -0.25],
    [-0.25, 0.25],
    [0.25, 0.25],
];
const NINE: readonly SampleOffset[] = [-1 / 3, 0, 1 / 3].flatMap((y) =>
    [-1 / 3, 0, 1 / 3].map((x) => [x, y] as const),
);

export function sampleOffsets(samples: FractalAntialiasing = 1): readonly SampleOffset[] {
    return samples === 9 ? NINE : samples === 4 ? FOUR : OFF;
}

export function sampleGridSize(samples: FractalAntialiasing = 1): number {
    return samples === 9 ? 3 : samples === 4 ? 2 : 1;
}

/** Display RGB values, before quantization. */
export function fractalColor(
    status: 'escaped' | 'bounded',
    smoothIteration?: number,
): readonly [number, number, number] {
    if (status === 'bounded') return [18, 20, 22];
    const t = smoothIteration ?? 0;
    const wave = 0.5 + 0.5 * Math.cos(t * 0.12);
    return [35 + 145 * wave, 82 + 112 * (1 - wave), 128 + 80 * Math.sin(t * 0.08) ** 2];
}

export function toLinear(channel: number): number {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function toDisplayByte(linear: number): number {
    const c = Math.max(0, Math.min(1, linear));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
}
