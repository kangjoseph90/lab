import { describe, expect, it } from 'vitest';
import { screenToWorld, zoomAt } from './viewport';

describe('zoomAt', () => {
    it('keeps the world point under the cursor fixed', () => {
        const viewport = { centerX: 1, centerY: -2, unitsPerPixel: 0.02 };
        const size = { x: 800, y: 600 };
        const cursor = { x: 120, y: 480 };
        const before = screenToWorld(cursor, size, viewport);
        const after = screenToWorld(cursor, size, zoomAt(viewport, cursor, size, 0.5));

        expect(after.x).toBeCloseTo(before.x);
        expect(after.y).toBeCloseTo(before.y);
    });
});
