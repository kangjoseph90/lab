export type Viewport = {
    centerX: number;
    centerY: number;
    unitsPerPixel: number;
};

export type Point = { x: number; y: number };

export const DEFAULT_VIEWPORT: Viewport = {
    centerX: 0,
    centerY: 0,
    unitsPerPixel: 0.0125,
};

export function screenToWorld(point: Point, size: Point, viewport: Viewport): Point {
    return {
        x: viewport.centerX + (point.x - size.x / 2) * viewport.unitsPerPixel,
        y: viewport.centerY - (point.y - size.y / 2) * viewport.unitsPerPixel,
    };
}

export function worldToScreen(point: Point, size: Point, viewport: Viewport): Point {
    return {
        x: size.x / 2 + (point.x - viewport.centerX) / viewport.unitsPerPixel,
        y: size.y / 2 - (point.y - viewport.centerY) / viewport.unitsPerPixel,
    };
}

export function zoomAt(viewport: Viewport, screen: Point, size: Point, factor: number): Viewport {
    const anchor = screenToWorld(screen, size, viewport);
    const unitsPerPixel = viewport.unitsPerPixel * factor;

    return {
        centerX: anchor.x - (screen.x - size.x / 2) * unitsPerPixel,
        centerY: anchor.y + (screen.y - size.y / 2) * unitsPerPixel,
        unitsPerPixel,
    };
}
