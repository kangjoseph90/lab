import { dd, ddAdd, ddDiv, ddMul, ddSub, ddToNumber } from '@lab/precision';
import type { DoubleDouble } from '@lab/precision';
import type { FractalViewport } from '../viewport';
import type { RenderOptions } from './renderer';
import { splitDoubleDoubleForGpu, splitFloat } from './gpu-precision';
import { deepZoomArithmetic } from './deep-zoom';
import type { DeepZoomArithmetic, PrecisePoint } from './deep-zoom';

const PERTURBATION_TILE_SIZE = 64;
type OrbitArray = Float32Array | Float64Array;
type OrbitStorage = 'gpu' | 'cpu';

function createOrbitArray(length: number, storage: OrbitStorage): OrbitArray {
    return storage === 'cpu' ? new Float64Array(length) : new Float32Array(length);
}

export type TileOrbits = {
    orbit: OrbitArray;
    anchors: OrbitArray;
    tileSize: number;
    tilesX: number;
    anchorCount: number;
    evaluatedCandidates: number;
    reusedAnchors: number;
};

type ReferenceOrbit = { referenceIterations: number; orbit: OrbitArray };
type CachedAnchor = ReferenceOrbit & {
    pointX: DoubleDouble;
    pointY: DoubleDouble;
    precisePoint?: PrecisePoint;
};
type TileAnchor = CachedAnchor & { pixelX: number; pixelY: number };
type StableTileAnchor = TileAnchor & { tileIndex: number };
type OrbitTrial = {
    reference?: ReferenceOrbit;
    escapeIterations: number;
    escapeMagnitude: number;
};

const INITIAL_ANCHOR_CANDIDATES = [
    [0.5, 0.5],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
] as const;
const REFINEMENT_DIRECTIONS = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
] as const;

/** Keeps only successful references from the preceding frame, in world coordinates. */
export class PerturbationOrbitFinder {
    #key = '';
    #references: CachedAnchor[] = [];
    #frameKey = '';
    #result: TileOrbits | undefined;
    readonly #storage: OrbitStorage;

    constructor(storage: OrbitStorage = 'gpu') {
        this.#storage = storage;
    }

    createTileOrbits(
        viewport: FractalViewport,
        width: number,
        height: number,
        maxIterations: number,
        precision: RenderOptions['precision'],
        fractal: RenderOptions['fractal'],
    ): TileOrbits {
        const arithmetic =
            this.#storage === 'cpu' ? deepZoomArithmetic(viewport, precision) : undefined;
        const key = JSON.stringify([
            precision,
            arithmetic?.bits,
            maxIterations,
            fractal.type,
            fractal.type === 'julia' ? [fractal.c.re, fractal.c.im] : null,
        ]);
        const frameKey = JSON.stringify([
            key,
            width,
            height,
            viewport.centerX.hi,
            viewport.centerX.lo,
            viewport.centerY.hi,
            viewport.centerY.lo,
            viewport.unitsPerPixel.hi,
            viewport.unitsPerPixel.lo,
        ]);
        // The exact same view can reuse even the tiles that borrowed a reference or failed.
        if (frameKey === this.#frameKey && this.#result) {
            return {
                ...this.#result,
                evaluatedCandidates: 0,
                reusedAnchors: this.#result.anchorCount,
            };
        }
        const { result, references } = buildTileOrbits(
            viewport,
            width,
            height,
            maxIterations,
            precision,
            fractal,
            key === this.#key ? this.#references : [],
            this.#storage,
            arithmetic,
        );
        this.#key = key;
        this.#references = references;
        this.#frameKey = frameKey;
        this.#result = result;
        return result;
    }
}

export function createTileOrbits(
    viewport: FractalViewport,
    width: number,
    height: number,
    maxIterations: number,
    precision: RenderOptions['precision'],
    fractal: RenderOptions['fractal'],
): TileOrbits {
    return new PerturbationOrbitFinder().createTileOrbits(
        viewport,
        width,
        height,
        maxIterations,
        precision,
        fractal,
    );
}

function projectAnchor(
    reference: CachedAnchor,
    viewport: FractalViewport,
    width: number,
    height: number,
    arithmetic?: DeepZoomArithmetic,
): TileAnchor {
    if (arithmetic && reference.precisePoint) {
        return { ...reference, ...arithmetic.project(reference.precisePoint, width, height) };
    }
    return {
        ...reference,
        pixelX:
            width / 2 +
            ddToNumber(ddDiv(ddSub(reference.pointX, viewport.centerX), viewport.unitsPerPixel)),
        pixelY:
            height / 2 -
            ddToNumber(ddDiv(ddSub(reference.pointY, viewport.centerY), viewport.unitsPerPixel)),
    };
}

function buildTileOrbits(
    viewport: FractalViewport,
    width: number,
    height: number,
    maxIterations: number,
    precision: RenderOptions['precision'],
    fractal: RenderOptions['fractal'],
    previousReferences: CachedAnchor[],
    storage: OrbitStorage,
    arithmetic?: DeepZoomArithmetic,
): { result: TileOrbits; references: CachedAnchor[] } {
    const tileSize = PERTURBATION_TILE_SIZE;
    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);
    const tileCount = tilesX * tilesY;
    const orbitStride = maxIterations + 1;
    const orbit = createOrbitArray(tileCount * orbitStride * 4, storage);
    const anchors = createOrbitArray(tileCount * 4, storage);
    const stableAnchors: StableTileAnchor[] = [];
    const reusable = new Map<number, TileAnchor>();
    let evaluatedCandidates = 0;
    let reusedAnchors = 0;

    // Project once and bucket by the new tile: no per-tile scan of the whole cache.
    for (const reference of previousReferences) {
        const projected = projectAnchor(reference, viewport, width, height, arithmetic);
        const { pixelX, pixelY } = projected;
        if (
            !Number.isFinite(pixelX) ||
            !Number.isFinite(pixelY) ||
            pixelX < 0 ||
            pixelX >= width ||
            pixelY < 0 ||
            pixelY >= height
        )
            continue;
        const tileX = Math.floor(pixelX / tileSize);
        const tileY = Math.floor(pixelY / tileSize);
        const tileIndex = tileY * tilesX + tileX;
        const centerX = (tileX * tileSize + Math.min(width, (tileX + 1) * tileSize)) / 2;
        const centerY = (tileY * tileSize + Math.min(height, (tileY + 1) * tileSize)) / 2;
        const existing = reusable.get(tileIndex);
        const distance = (anchor: TileAnchor) =>
            (anchor.pixelX - centerX) ** 2 + (anchor.pixelY - centerY) ** 2;
        if (!existing || distance(projected) < distance(existing))
            reusable.set(tileIndex, projected);
    }

    for (let tileY = 0; tileY < tilesY; tileY += 1) {
        for (let tileX = 0; tileX < tilesX; tileX += 1) {
            const tileIndex = tileY * tilesX + tileX;
            const base = tileIndex * orbitStride * 4;
            const tileWidth = Math.min(tileSize, width - tileX * tileSize);
            const tileHeight = Math.min(tileSize, height - tileY * tileSize);
            let candidate = reusable.get(tileIndex);
            if (candidate) {
                reusedAnchors++;
            } else {
                const search = findStableTileAnchor(
                    viewport,
                    width,
                    height,
                    tileX * tileSize,
                    tileY * tileSize,
                    tileWidth,
                    tileHeight,
                    maxIterations,
                    precision,
                    fractal,
                    storage,
                    arithmetic,
                );
                candidate = search.anchor;
                evaluatedCandidates += search.evaluatedCandidates;
            }

            if (!candidate) {
                anchors[tileIndex * 4] = -1;
                anchors[tileIndex * 4 + 1] = -1;
                continue;
            }

            orbit.set(candidate.orbit, base);
            anchors[tileIndex * 4] = candidate.pixelX;
            anchors[tileIndex * 4 + 1] = candidate.pixelY;
            anchors[tileIndex * 4 + 2] = candidate.referenceIterations;
            stableAnchors.push({ tileIndex, ...candidate });
        }
    }

    fillMissingTileOrbits(orbit, anchors, tilesX, tilesY, orbitStride, stableAnchors);

    return {
        result: {
            orbit,
            anchors,
            tileSize,
            tilesX,
            anchorCount: stableAnchors.length,
            evaluatedCandidates,
            reusedAnchors,
        },
        references: stableAnchors,
    };
}

function fillMissingTileOrbits(
    orbit: OrbitArray,
    anchors: OrbitArray,
    tilesX: number,
    tilesY: number,
    orbitStride: number,
    stableAnchors: StableTileAnchor[],
): void {
    if (stableAnchors.length === 0) return;

    for (let tileY = 0; tileY < tilesY; tileY += 1) {
        for (let tileX = 0; tileX < tilesX; tileX += 1) {
            const tileIndex = tileY * tilesX + tileX;
            const base = tileIndex * orbitStride * 4;

            if ((anchors[tileIndex * 4] ?? -1) >= 0) continue;

            const nearest = findNearestStableAnchor(tileX, tileY, tilesX, stableAnchors);

            orbit.set(nearest.orbit, base);
            anchors[tileIndex * 4] = nearest.pixelX;
            anchors[tileIndex * 4 + 1] = nearest.pixelY;
            anchors[tileIndex * 4 + 2] = nearest.referenceIterations;
            anchors[tileIndex * 4 + 3] = 0;
        }
    }
}

function findNearestStableAnchor(
    tileX: number,
    tileY: number,
    tilesX: number,
    stableAnchors: StableTileAnchor[],
): StableTileAnchor {
    const firstAnchor = stableAnchors[0];
    if (!firstAnchor) throw new Error('Expected at least one stable anchor.');

    let nearest = firstAnchor;
    let nearestDistance = Infinity;

    for (const anchor of stableAnchors) {
        const anchorTileX = anchor.tileIndex % tilesX;
        const anchorTileY = Math.floor(anchor.tileIndex / tilesX);
        const dx = anchorTileX - tileX;
        const dy = anchorTileY - tileY;
        const distance = dx * dx + dy * dy;

        if (distance < nearestDistance) {
            nearest = anchor;
            nearestDistance = distance;
        }
    }

    return nearest;
}

function findStableTileAnchor(
    viewport: FractalViewport,
    width: number,
    height: number,
    tileLeft: number,
    tileTop: number,
    tileWidth: number,
    tileHeight: number,
    maxIterations: number,
    precision: RenderOptions['precision'],
    fractal: RenderOptions['fractal'],
    storage: OrbitStorage,
    arithmetic?: DeepZoomArithmetic,
): { anchor?: TileAnchor; evaluatedCandidates: number } {
    // Failed trials overwrite the same scratch buffer, rather than allocating nine orbits.
    const scratch = createOrbitArray((maxIterations + 1) * 4, storage);
    const visited = new Set<string>();
    let evaluatedCandidates = 0;
    let best: { pixelX: number; pixelY: number; trial: OrbitTrial } | undefined;

    const evaluate = (x: number, y: number): TileAnchor | undefined => {
        const pixelX = tileLeft + Math.min(tileWidth - 0.5, Math.max(0.5, x));
        const pixelY = tileTop + Math.min(tileHeight - 0.5, Math.max(0.5, y));
        const key = `${pixelX},${pixelY}`;
        if (visited.has(key)) return;
        visited.add(key);
        evaluatedCandidates++;
        let pointX = coordinateXDD(viewport, pixelX, width);
        let pointY = coordinateYDD(viewport, pixelY, height);
        if (precision === 'number') {
            pointX = dd(ddToNumber(pointX));
            pointY = dd(ddToNumber(pointY));
        }
        const precisePoint = arithmetic?.point(pixelX, pixelY, width, height);
        const trial =
            arithmetic && precisePoint
                ? createPreciseTileOrbit(arithmetic, precisePoint, maxIterations, fractal, scratch)
                : precision === 'double-double'
                  ? createTileOrbitDD(pointX, pointY, maxIterations, fractal, scratch)
                  : createTileOrbitNumber(pointX.hi, pointY.hi, maxIterations, fractal, scratch);
        if (trial.reference) {
            // Anchor the shader to the exact coordinate used for the CPU reference orbit.
            return projectAnchor(
                { pointX, pointY, ...(precisePoint ? { precisePoint } : {}), ...trial.reference },
                viewport,
                width,
                height,
                arithmetic,
            );
        }
        if (
            !best ||
            trial.escapeIterations > best.trial.escapeIterations ||
            (trial.escapeIterations === best.trial.escapeIterations &&
                trial.escapeMagnitude < best.trial.escapeMagnitude)
        ) {
            best = { pixelX, pixelY, trial };
        }
    };

    for (const [offsetX, offsetY] of INITIAL_ANCHOR_CANDIDATES) {
        const anchor = evaluate(tileWidth * offsetX, tileHeight * offsetY);
        if (anchor) return { anchor, evaluatedCandidates };
    }
    // Spend the remaining four trials at half the coarse spacing around the best seed.
    if (best) {
        const seed = best;
        for (const [dx, dy] of REFINEMENT_DIRECTIONS) {
            const anchor = evaluate(
                seed.pixelX - tileLeft + (dx * tileWidth) / 8,
                seed.pixelY - tileTop + (dy * tileHeight) / 8,
            );
            if (anchor) return { anchor, evaluatedCandidates };
        }
    }
    return { evaluatedCandidates };
}

function createTileOrbitNumber(
    x: number,
    y: number,
    maxIterations: number,
    fractal: RenderOptions['fractal'],
    orbit: OrbitArray,
): OrbitTrial {
    let zx = fractal.type === 'julia' ? x : 0;
    let zy = fractal.type === 'julia' ? y : 0;
    const cx = fractal.type === 'julia' ? fractal.c.re : x;
    const cy = fractal.type === 'julia' ? fractal.c.im : y;

    for (let i = 0; i <= maxIterations; i += 1) {
        if (!Number.isFinite(zx) || !Number.isFinite(zy)) {
            return { escapeIterations: i, escapeMagnitude: Infinity };
        }

        writeNumberOrbitPoint(orbit, i, zx, zy);

        if (zx * zx + zy * zy > 4) {
            if (fractal.type === 'julia') {
                fillNumberOrbitTail(orbit, i + 1, maxIterations, zx, zy);
                return {
                    reference: { orbit, referenceIterations: i },
                    escapeIterations: i,
                    escapeMagnitude: 0,
                };
            }

            return { escapeIterations: i, escapeMagnitude: zx * zx + zy * zy };
        }

        const zx2 = zx * zx;
        const zy2 = zy * zy;
        const nextY = 2 * zx * zy + cy;
        const nextX = zx2 - zy2 + cx;

        zx = nextX;
        zy = nextY;
    }

    return {
        reference: { orbit, referenceIterations: maxIterations },
        escapeIterations: maxIterations,
        escapeMagnitude: 0,
    };
}

function createPreciseTileOrbit(
    arithmetic: DeepZoomArithmetic,
    point: PrecisePoint,
    maxIterations: number,
    fractal: RenderOptions['fractal'],
    orbit: OrbitArray,
): OrbitTrial {
    const result = arithmetic.iterate(point, maxIterations, fractal, (i, x, y) =>
        writeDoubleDoubleOrbitPoint(orbit, i, x, y),
    );
    const reference = result.status === 'bounded' || fractal.type === 'julia';
    if (reference && result.status === 'escaped') {
        for (let i = result.iterations + 1; i <= maxIterations; i++) {
            orbit.set(orbit.subarray(result.iterations * 4, result.iterations * 4 + 4), i * 4);
        }
    }
    return {
        ...(reference ? { reference: { orbit, referenceIterations: result.iterations } } : {}),
        escapeIterations: result.iterations,
        escapeMagnitude: result.zx * result.zx + result.zy * result.zy,
    };
}

function createTileOrbitDD(
    x: DoubleDouble,
    y: DoubleDouble,
    maxIterations: number,
    fractal: RenderOptions['fractal'],
    orbit: OrbitArray,
): OrbitTrial {
    let zx = fractal.type === 'julia' ? x : dd(0);
    let zy = fractal.type === 'julia' ? y : dd(0);
    const cx = fractal.type === 'julia' ? dd(fractal.c.re) : x;
    const cy = fractal.type === 'julia' ? dd(fractal.c.im) : y;

    for (let i = 0; i <= maxIterations; i += 1) {
        const zxValue = zx.hi + zx.lo;
        const zyValue = zy.hi + zy.lo;

        if (!Number.isFinite(zxValue) || !Number.isFinite(zyValue)) {
            return { escapeIterations: i, escapeMagnitude: Infinity };
        }

        writeDoubleDoubleOrbitPoint(orbit, i, zx, zy);

        if (zxValue * zxValue + zyValue * zyValue > 4) {
            if (fractal.type === 'julia') {
                fillDoubleDoubleOrbitTail(orbit, i + 1, maxIterations, zx, zy);
                return {
                    reference: { orbit, referenceIterations: i },
                    escapeIterations: i,
                    escapeMagnitude: 0,
                };
            }

            return { escapeIterations: i, escapeMagnitude: zxValue * zxValue + zyValue * zyValue };
        }

        const zx2 = ddMul(zx, zx);
        const zy2 = ddMul(zy, zy);
        const nextY = ddAdd(ddMul(dd(2), ddMul(zx, zy)), cy);
        const nextX = ddAdd(ddSub(zx2, zy2), cx);

        zx = nextX;
        zy = nextY;
    }

    return {
        reference: { orbit, referenceIterations: maxIterations },
        escapeIterations: maxIterations,
        escapeMagnitude: 0,
    };
}

function coordinateXDD(viewport: FractalViewport, pixel: number, width: number): DoubleDouble {
    return ddAdd(viewport.centerX, ddMul(dd(pixel - width / 2), viewport.unitsPerPixel));
}

function coordinateYDD(viewport: FractalViewport, pixel: number, height: number): DoubleDouble {
    return ddSub(viewport.centerY, ddMul(dd(pixel - height / 2), viewport.unitsPerPixel));
}

function writeNumberOrbitPoint(orbit: OrbitArray, index: number, re: number, im: number): void {
    if (orbit instanceof Float64Array) {
        writeOrbitPoint(orbit, index, re, im, 0, 0);
        return;
    }
    const reParts = splitFloat(re);
    const imParts = splitFloat(im);
    writeOrbitPoint(orbit, index, reParts.hi, imParts.hi, reParts.lo, imParts.lo);
}

function writeDoubleDoubleOrbitPoint(
    orbit: OrbitArray,
    index: number,
    re: DoubleDouble,
    im: DoubleDouble,
): void {
    if (orbit instanceof Float64Array) {
        writeOrbitPoint(orbit, index, re.hi, im.hi, re.lo, im.lo);
        return;
    }
    const reParts = splitDoubleDoubleForGpu(re);
    const imParts = splitDoubleDoubleForGpu(im);
    writeOrbitPoint(orbit, index, reParts.hi, imParts.hi, reParts.lo, imParts.lo);
}

function fillNumberOrbitTail(
    orbit: OrbitArray,
    start: number,
    maxIterations: number,
    re: number,
    im: number,
): void {
    for (let i = start; i <= maxIterations; i += 1) {
        writeNumberOrbitPoint(orbit, i, re, im);
    }
}

function fillDoubleDoubleOrbitTail(
    orbit: OrbitArray,
    start: number,
    maxIterations: number,
    re: DoubleDouble,
    im: DoubleDouble,
): void {
    for (let i = start; i <= maxIterations; i += 1) {
        writeDoubleDoubleOrbitPoint(orbit, i, re, im);
    }
}

function writeOrbitPoint(
    orbit: OrbitArray,
    index: number,
    reHi: number,
    imHi: number,
    reLo: number,
    imLo: number,
): void {
    const offset = index * 4;
    orbit[offset] = reHi;
    orbit[offset + 1] = imHi;
    orbit[offset + 2] = reLo;
    orbit[offset + 3] = imLo;
}
