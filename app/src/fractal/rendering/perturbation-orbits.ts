import { dd, ddAdd, ddMul, ddSub, ddToNumber } from '@lab/precision';
import type { DoubleDouble } from '@lab/precision';
import type { FractalViewport } from '../viewport';
import type { RenderOptions } from './renderer';
import { splitDoubleDoubleForGpu, splitFloat } from './gpu-precision';

const PERTURBATION_TILE_SIZE = 64;

export type TileOrbits = {
    orbit: Float32Array;
    anchors: Float32Array;
    tileSize: number;
    tilesX: number;
    anchorCount: number;
};

type StableTileAnchor = {
    tileIndex: number;
    pixelX: number;
    pixelY: number;
    orbit: Float32Array;
};

const TILE_ANCHOR_CANDIDATES = [
    [0.5, 0.5],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
] as const;

export function createMandelbrotTileOrbits(
    viewport: FractalViewport,
    width: number,
    height: number,
    maxIterations: number,
    precision: RenderOptions['precision'],
): TileOrbits {
    const tileSize = PERTURBATION_TILE_SIZE;
    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);
    const tileCount = tilesX * tilesY;
    const orbitStride = maxIterations + 1;
    const orbit = new Float32Array(tileCount * orbitStride * 4);
    const anchors = new Float32Array(tileCount * 2);
    const stableAnchors: StableTileAnchor[] = [];

    for (let tileY = 0; tileY < tilesY; tileY += 1) {
        for (let tileX = 0; tileX < tilesX; tileX += 1) {
            const tileIndex = tileY * tilesX + tileX;
            const base = tileIndex * orbitStride * 4;
            const tileWidth = Math.min(tileSize, width - tileX * tileSize);
            const tileHeight = Math.min(tileSize, height - tileY * tileSize);
            const candidate = findStableTileAnchor(
                viewport,
                width,
                height,
                tileX * tileSize,
                tileY * tileSize,
                tileWidth,
                tileHeight,
                maxIterations,
                precision,
            );

            if (!candidate) {
                anchors[tileIndex * 2] = -1;
                anchors[tileIndex * 2 + 1] = -1;
                continue;
            }

            orbit.set(candidate.orbit, base);
            anchors[tileIndex * 2] = candidate.pixelX;
            anchors[tileIndex * 2 + 1] = candidate.pixelY;
            stableAnchors.push({ tileIndex, ...candidate });
        }
    }

    fillMissingTileOrbits(orbit, anchors, tilesX, tilesY, orbitStride, stableAnchors);

    return { orbit, anchors, tileSize, tilesX, anchorCount: stableAnchors.length };
}

function fillMissingTileOrbits(
    orbit: Float32Array,
    anchors: Float32Array,
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

            if ((anchors[tileIndex * 2] ?? -1) >= 0) continue;

            const nearest = findNearestStableAnchor(tileX, tileY, tilesX, stableAnchors);

            orbit.set(nearest.orbit, base);
            anchors[tileIndex * 2] = nearest.pixelX;
            anchors[tileIndex * 2 + 1] = nearest.pixelY;
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
): { pixelX: number; pixelY: number; orbit: Float32Array } | undefined {
    for (const [offsetX, offsetY] of TILE_ANCHOR_CANDIDATES) {
        const pixelX = tileLeft + Math.min(tileWidth - 0.5, Math.max(0.5, tileWidth * offsetX));
        const pixelY = tileTop + Math.min(tileHeight - 0.5, Math.max(0.5, tileHeight * offsetY));
        const orbit =
            precision === 'double-double'
                ? createStableMandelbrotOrbitDD(
                      mandelbrotCoordinateXDD(viewport, pixelX, width),
                      mandelbrotCoordinateYDD(viewport, pixelY, height),
                      maxIterations,
                  )
                : createStableMandelbrotOrbitNumber(
                      ddToNumber(mandelbrotCoordinateXDD(viewport, pixelX, width)),
                      ddToNumber(mandelbrotCoordinateYDD(viewport, pixelY, height)),
                      maxIterations,
                  );

        if (orbit) return { pixelX, pixelY, orbit };
    }

    return undefined;
}

function createStableMandelbrotOrbitNumber(
    cx: number,
    cy: number,
    maxIterations: number,
): Float32Array | undefined {
    const orbit = new Float32Array((maxIterations + 1) * 4);
    let zx = 0;
    let zy = 0;

    for (let i = 0; i <= maxIterations; i += 1) {
        if (!Number.isFinite(zx) || !Number.isFinite(zy) || zx * zx + zy * zy > 4) {
            return undefined;
        }

        writeNumberOrbitPoint(orbit, i, zx, zy);

        const zx2 = zx * zx;
        const zy2 = zy * zy;
        const nextY = 2 * zx * zy + cy;
        const nextX = zx2 - zy2 + cx;

        zx = nextX;
        zy = nextY;
    }

    return orbit;
}

function createStableMandelbrotOrbitDD(
    cx: DoubleDouble,
    cy: DoubleDouble,
    maxIterations: number,
): Float32Array | undefined {
    const orbit = new Float32Array((maxIterations + 1) * 4);
    let zx = dd(0);
    let zy = dd(0);

    for (let i = 0; i <= maxIterations; i += 1) {
        const zxValue = zx.hi + zx.lo;
        const zyValue = zy.hi + zy.lo;

        if (
            !Number.isFinite(zxValue) ||
            !Number.isFinite(zyValue) ||
            zxValue * zxValue + zyValue * zyValue > 4
        ) {
            return undefined;
        }

        writeDoubleDoubleOrbitPoint(orbit, i, zx, zy);

        const zx2 = ddMul(zx, zx);
        const zy2 = ddMul(zy, zy);
        const nextY = ddAdd(ddMul(dd(2), ddMul(zx, zy)), cy);
        const nextX = ddAdd(ddSub(zx2, zy2), cx);

        zx = nextX;
        zy = nextY;
    }

    return orbit;
}

function mandelbrotCoordinateXDD(
    viewport: FractalViewport,
    pixel: number,
    width: number,
): DoubleDouble {
    return ddAdd(viewport.centerX, ddMul(dd(pixel - width / 2), viewport.unitsPerPixel));
}

function mandelbrotCoordinateYDD(
    viewport: FractalViewport,
    pixel: number,
    height: number,
): DoubleDouble {
    return ddSub(viewport.centerY, ddMul(dd(pixel - height / 2), viewport.unitsPerPixel));
}

function writeNumberOrbitPoint(orbit: Float32Array, index: number, re: number, im: number): void {
    const reParts = splitFloat(re);
    const imParts = splitFloat(im);
    writeOrbitPoint(orbit, index, reParts.hi, imParts.hi, reParts.lo, imParts.lo);
}

function writeDoubleDoubleOrbitPoint(
    orbit: Float32Array,
    index: number,
    re: DoubleDouble,
    im: DoubleDouble,
): void {
    const reParts = splitDoubleDoubleForGpu(re);
    const imParts = splitDoubleDoubleForGpu(im);
    writeOrbitPoint(orbit, index, reParts.hi, imParts.hi, reParts.lo, imParts.lo);
}

function writeOrbitPoint(
    orbit: Float32Array,
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
