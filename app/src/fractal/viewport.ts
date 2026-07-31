import { dd, ddAdd, ddMul, ddSub, ddToNumber } from '@lab/precision';
import type { DoubleDouble } from '@lab/precision';
import type { Point, Viewport } from '../graph/viewport';

export type FractalViewport = {
    centerX: DoubleDouble;
    centerY: DoubleDouble;
    unitsPerPixel: DoubleDouble;
};

export function fractalViewport(
    centerX: number,
    centerY: number,
    unitsPerPixel: number,
): FractalViewport {
    return {
        centerX: dd(centerX),
        centerY: dd(centerY),
        unitsPerPixel: dd(unitsPerPixel),
    };
}

export function fractalViewportToNumber(viewport: FractalViewport): Viewport {
    return {
        centerX: ddToNumber(viewport.centerX),
        centerY: ddToNumber(viewport.centerY),
        unitsPerPixel: ddToNumber(viewport.unitsPerPixel),
    };
}

export function fractalScreenToWorldNumber(
    point: Point,
    size: Point,
    viewport: FractalViewport,
): Point {
    return {
        x: ddToNumber(
            ddAdd(viewport.centerX, ddMul(dd(point.x - size.x / 2), viewport.unitsPerPixel)),
        ),
        y: ddToNumber(
            ddSub(viewport.centerY, ddMul(dd(point.y - size.y / 2), viewport.unitsPerPixel)),
        ),
    };
}

export function panFractalViewport(
    viewport: FractalViewport,
    dx: number,
    dy: number,
): FractalViewport {
    return {
        ...viewport,
        centerX: ddSub(viewport.centerX, ddMul(dd(dx), viewport.unitsPerPixel)),
        centerY: ddAdd(viewport.centerY, ddMul(dd(dy), viewport.unitsPerPixel)),
    };
}

export function scaleFractalViewportUnits(
    viewport: FractalViewport,
    factor: number,
): FractalViewport {
    return {
        ...viewport,
        unitsPerPixel: ddMul(viewport.unitsPerPixel, dd(factor)),
    };
}

export function zoomAtFractal(
    viewport: FractalViewport,
    screen: Point,
    size: Point,
    factor: number,
): FractalViewport {
    const anchorX = ddAdd(
        viewport.centerX,
        ddMul(dd(screen.x - size.x / 2), viewport.unitsPerPixel),
    );
    const anchorY = ddSub(
        viewport.centerY,
        ddMul(dd(screen.y - size.y / 2), viewport.unitsPerPixel),
    );
    const unitsPerPixel = ddMul(viewport.unitsPerPixel, dd(factor));

    return {
        centerX: ddSub(anchorX, ddMul(dd(screen.x - size.x / 2), unitsPerPixel)),
        centerY: ddAdd(anchorY, ddMul(dd(screen.y - size.y / 2), unitsPerPixel)),
        unitsPerPixel,
    };
}
