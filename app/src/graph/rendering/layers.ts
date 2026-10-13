import type { Equation } from '../equation';

export type GraphColor = readonly [number, number, number];
export type GraphLayer = { equation: Equation; color: GraphColor };

export function hexToColor(hex: string): GraphColor {
    if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Invalid graph color: ${hex}`);
    return [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
    ];
}

export function blendPixel(
    pixels: Uint8ClampedArray,
    offset: number,
    color: GraphColor,
    coverage: number,
): void {
    for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(
            pixels[offset + channel]! + (color[channel]! - pixels[offset + channel]!) * coverage,
        );
    }
}
