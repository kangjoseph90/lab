import { containsZero, interval } from '@lab/math';
import type { CompiledEquation } from '../equation';

export const INEQUALITY_OPACITY = 0.2;

export function getCoverage(
    compiled: CompiledEquation,
    x: number,
    y: number,
    lineThreshold: number,
    unitsPerPixel: number,
): number {
    const value = compiled.value(x, y);
    if (!Number.isFinite(value)) return 0;

    if (compiled.relation === 'lt') return value < 0 ? INEQUALITY_OPACITY : 0;
    if (compiled.relation === 'gt') return value > 0 ? INEQUALITY_OPACITY : 0;

    const distance = findZeroDistance(compiled, x, y, value, unitsPerPixel, lineThreshold);
    if (compiled.relation === 'eq') {
        return distance === undefined ? 0 : clamp(1.5 - distance / lineThreshold);
    }

    const inside = compiled.relation === 'lte' ? value <= 0 : value >= 0;
    if (distance === undefined) return inside ? INEQUALITY_OPACITY : 0;

    const edge = clamp(0.5 + (inside ? distance : -distance) / unitsPerPixel);
    return edge * INEQUALITY_OPACITY;
}

function findZeroDistance(
    compiled: CompiledEquation,
    x: number,
    y: number,
    initialValue: number,
    unitsPerPixel: number,
    lineThreshold: number,
): number | undefined {
    if (initialValue === 0) return 0;

    const candidateRadius = unitsPerPixel * 4;
    const convergenceDistance = unitsPerPixel * 0.1;
    let qx = x;
    let qy = y;
    let value = initialValue;
    let residual = Math.abs(value);
    const initialResidual = residual;

    for (let iteration = 0; iteration <= 4; iteration += 1) {
        if (iteration > 0 && residual === 0) return Math.hypot(qx - x, qy - y);

        const gx = compiled.dx(qx, qy);
        const gy = compiled.dy(qx, qy);
        const gradientSquared = gx * gx + gy * gy;

        if (!Number.isFinite(gradientSquared) || gradientSquared <= 1e-24) return undefined;

        const gradient = Math.sqrt(gradientSquared);
        const estimatedDistance = residual / gradient;
        if (iteration === 0 && estimatedDistance > candidateRadius) return undefined;
        if (
            iteration > 0 &&
            residual <= initialResidual / 16 &&
            estimatedDistance <= convergenceDistance
        ) {
            const distance = Math.hypot(qx - x, qy - y) + estimatedDistance;
            return intervalContainsNearbyZero(compiled, x, y, lineThreshold) ? distance : undefined;
        }
        if (iteration === 4) return undefined;

        const scale = value / gradientSquared;
        let stepX = scale * gx;
        let stepY = scale * gy;
        let nextX = qx - stepX;
        let nextY = qy - stepY;
        let nextValue = compiled.value(nextX, nextY);

        for (
            let backtrack = 0;
            backtrack < 2 && Math.abs(nextValue) > residual * 0.5;
            backtrack += 1
        ) {
            stepX *= 0.5;
            stepY *= 0.5;
            nextX = qx - stepX;
            nextY = qy - stepY;
            nextValue = compiled.value(nextX, nextY);
        }

        if (!Number.isFinite(nextValue) || Math.abs(nextValue) > residual * 0.5) return undefined;
        if (Math.hypot(nextX - x, nextY - y) > candidateRadius) return undefined;

        qx = nextX;
        qy = nextY;
        value = nextValue;
        residual = Math.abs(value);
    }

    return undefined;
}

function intervalContainsNearbyZero(
    compiled: CompiledEquation,
    x: number,
    y: number,
    lineThreshold: number,
): boolean {
    const radius = lineThreshold * 1.5;
    const range = compiled.interval({
        x: interval(x - radius, x + radius),
        y: interval(y - radius, y + radius),
    });
    return containsZero(range);
}

function clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
}
