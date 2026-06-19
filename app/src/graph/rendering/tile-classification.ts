import type { Relation } from '../equation';

export type TileClassification = 'inside' | 'outside' | 'candidate';

export function classifyTile(
    relation: Relation,
    samples: readonly number[],
    gradients: readonly number[],
    sampleRadius: number,
    safetyFactor = 2,
): TileClassification {
    if (
        samples.some((value) => !Number.isFinite(value)) ||
        gradients.some((value) => !Number.isFinite(value))
    ) {
        return 'candidate';
    }

    const minimum = Math.min(...samples);
    const maximum = Math.max(...samples);
    if (minimum <= 0 && maximum >= 0) return 'candidate';

    const clearance = Math.min(...samples.map(Math.abs));
    const maxGradient = Math.max(...gradients);
    if (clearance <= maxGradient * sampleRadius * safetyFactor) return 'candidate';

    if (relation === 'eq') return 'outside';

    const less = relation === 'lt' || relation === 'lte';
    return less === maximum < 0 ? 'inside' : 'outside';
}
