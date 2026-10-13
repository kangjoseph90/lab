import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEquation, compileEquation } from '../equation';
import { GraphGpuRenderer } from './gpu-renderer';
import { GraphRenderer } from './renderer';
import type { RenderWorkerRequest, RenderWorkerResponse } from './render-protocol';

const viewport = { centerX: 0, centerY: 0, unitsPerPixel: 0.01 };
const options = { lineWidth: 1.35, color: [19, 105, 196] as const };

function setup() {
    let worker!: FakeWorker;
    class FakeWorker {
        onmessage!: (event: { data: RenderWorkerResponse }) => void;
        onerror = undefined;
        messages: RenderWorkerRequest[] = [];
        constructor() {
            worker = this;
        }
        postMessage(message: RenderWorkerRequest) {
            this.messages.push(message);
        }
        respond(data: RenderWorkerResponse) {
            this.onmessage({ data });
        }
    }
    const context = () => ({
        putImageData: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
    });
    const mainContext = context();
    const canvas = { width: 17, height: 11, getContext: () => mainContext };
    vi.stubGlobal('document', {
        createElement: () => ({ width: 0, height: 0, getContext: () => context() }),
    });
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal(
        'ImageData',
        class {
            constructor(
                public data: Uint8ClampedArray,
                public width: number,
                public height: number,
            ) {}
        },
    );
    const renderer = new GraphRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.setEquation(parseEquation('x^2+y^2=4'));
    const gpu = vi.spyOn(GraphGpuRenderer.prototype, 'render');
    return { renderer, worker, mainContext, gpu };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('GraphRenderer backend transitions', () => {
    it('sends cloneable ASTs even when callers pass compiled equations', () => {
        const state = setup();
        state.renderer.setLayers([{ equation: compileEquation('y=sin(x)'), color: [220, 30, 40] }]);
        const message = state.worker.messages.at(-1)!;
        expect(() => structuredClone(message)).not.toThrow();
        if (message.type !== 'set-layers') throw new Error('Expected layer update');
        expect(message.layers).toHaveLength(1);
        expect(message.layers[0]!.equation).not.toHaveProperty('value');
    });

    it('clears the graph and keeps the grid when all expressions are hidden or invalid', async () => {
        const state = setup();
        state.renderer.setLayers([]);
        await state.renderer.render(viewport, { ...options, backend: 'gpu' });
        expect(state.gpu).not.toHaveBeenCalled();
        expect(state.mainContext.fillRect).toHaveBeenCalledWith(0, 0, 17, 11);
        expect(state.mainContext.stroke).toHaveBeenCalledTimes(2);
        expect(state.worker.messages.at(-1)?.type).toBe('cancel');
    });

    it('cancels pending CPU work and ignores late worker chunks after switching to GPU', async () => {
        const state = setup();
        const cpu = state.renderer.render(viewport, { ...options, backend: 'cpu' });
        const request = state.worker.messages.at(-1)!;
        if (request.type !== 'render') throw new Error('Expected CPU render');
        let resolve!: (image: ImageData) => void;
        state.gpu.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        const gpu = state.renderer.render(viewport, { ...options, backend: 'gpu' });
        await cpu;
        state.worker.respond({
            type: 'chunk',
            id: request.id,
            y: 0,
            width: 17,
            height: 11,
            pixels: new ArrayBuffer(17 * 11 * 4),
        });
        expect(state.mainContext.putImageData).not.toHaveBeenCalled();
        const image = new ImageData(new Uint8ClampedArray(17 * 11 * 4), 17, 11);
        resolve(image);
        await gpu;
        expect(state.mainContext.putImageData).toHaveBeenCalledExactlyOnceWith(image, 0, 0);
    });

    it('prevents a GPU result from overwriting a newer CPU render', async () => {
        const state = setup();
        let resolve!: (image: ImageData) => void;
        state.gpu.mockImplementation(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        const gpu = state.renderer.render(viewport, { ...options, backend: 'gpu' });
        const cpu = state.renderer.render(viewport, { ...options, backend: 'cpu' });
        resolve(new ImageData(new Uint8ClampedArray(17 * 11 * 4), 17, 11));
        await gpu;
        expect(state.mainContext.putImageData).not.toHaveBeenCalled();
        const request = state.worker.messages.at(-1)!;
        if (request.type !== 'render') throw new Error('Expected CPU render');
        state.worker.respond({ type: 'complete', id: request.id });
        await cpu;
        expect(state.mainContext.drawImage).toHaveBeenCalledTimes(1);
    });

    it('surfaces GPU failures and can subsequently render with CPU', async () => {
        const state = setup();
        state.gpu.mockRejectedValue(new Error('WebGPU unavailable'));
        await expect(
            state.renderer.render(viewport, { ...options, backend: 'gpu' }),
        ).rejects.toThrow('WebGPU unavailable');
        const cpu = state.renderer.render(viewport, { ...options, backend: 'cpu' });
        const request = state.worker.messages.at(-1)!;
        if (request.type !== 'render') throw new Error('Expected CPU render');
        state.worker.respond({ type: 'complete', id: request.id });
        await cpu;
        expect(state.mainContext.drawImage).toHaveBeenCalledTimes(1);
    });
});
