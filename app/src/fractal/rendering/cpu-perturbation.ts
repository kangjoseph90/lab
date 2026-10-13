import { smoothEscapeTimeRaw } from '@lab/fractal';
import type { RawOrbitResult } from '@lab/fractal';
import type { TileOrbits } from './perturbation-orbits';
import type { FractalConfig } from './renderer';

const GLITCH_THRESHOLD = 1e-6;
const ESCAPE_TOLERANCE = 1e-12;

/** Undefined asks the worker to recompute this pixel directly at the selected precision. */
export function iteratePerturbedPoint(
    references: TileOrbits,
    pixelX: number,
    pixelY: number,
    unitsPerPixel: number,
    maxIterations: number,
    fractal: FractalConfig,
    tileIndex?: number,
): RawOrbitResult | undefined {
    const tile =
        tileIndex ??
        Math.floor(pixelY / references.tileSize) * references.tilesX +
            Math.floor(pixelX / references.tileSize);
    const anchor = tile * 4;
    const anchorX = references.anchors[anchor]!;
    const anchorY = references.anchors[anchor + 1]!;
    if (anchorX < 0 || anchorY < 0) return;
    const referenceIterations = references.anchors[anchor + 2]!;
    const base = tile * (maxIterations + 1) * 4;
    const dx = (pixelX - anchorX) * unitsPerPixel;
    const dy = (anchorY - pixelY) * unitsPerPixel;
    const isJulia = fractal.type === 'julia';
    const dcx = isJulia ? 0 : dx;
    const dcy = isJulia ? 0 : dy;
    let dzx = isJulia ? dx : 0;
    let dzy = isJulia ? dy : 0;

    for (let iterations = 0; iterations <= maxIterations; iterations++) {
        // Julia reference tails are padded after escape, not valid for further perturbation.
        if (isJulia && iterations > referenceIterations) return;
        const index = base + iterations * 4;
        const refX = references.orbit[index]! + references.orbit[index + 2]!;
        const refY = references.orbit[index + 1]! + references.orbit[index + 3]!;
        const zx = refX + dzx;
        const zy = refY + dzy;
        const magnitude2 = zx * zx + zy * zy;
        const reference2 = refX * refX + refY * refY;
        const delta2 = dzx * dzx + dzy * dzy;

        // Avoid cancellation glitches, a delta dominating the orbit, and ambiguous escape tests.
        if (
            !Number.isFinite(magnitude2) ||
            !Number.isFinite(delta2) ||
            magnitude2 < GLITCH_THRESHOLD * reference2 ||
            delta2 > magnitude2 ||
            Math.abs(magnitude2 - 4) < ESCAPE_TOLERANCE
        )
            return;

        if (magnitude2 > 4) {
            return {
                status: 'escaped',
                iterations,
                zx,
                zy,
                smoothIteration: smoothEscapeTimeRaw(zx, zy, iterations),
            };
        }
        if (iterations === maxIterations) {
            return { status: 'bounded', iterations, zx, zy };
        }
        const nextY = 2 * (refX * dzy + refY * dzx + dzx * dzy) + dcy;
        const nextX = 2 * (refX * dzx - refY * dzy) + dzx * dzx - dzy * dzy + dcx;
        dzx = nextX;
        dzy = nextY;
    }
}
