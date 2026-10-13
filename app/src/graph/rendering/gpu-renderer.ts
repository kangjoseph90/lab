import type { Equation } from '../equation';
import type { Viewport } from '../viewport';
import type { RenderOptions } from './renderer';
import { createGraphSceneShader, GRAPH_WORKGROUP_SIZE } from './gpu-shader';
import type { GraphLayer } from './layers';

export class GraphGpuRenderer {
    #device: Promise<GPUDevice> | undefined;
    readonly #pipelines = new Map<string, Promise<GPUComputePipeline>>();
    readonly #sources = new WeakMap<readonly GraphLayer[], string>();
    readonly #singleLayers = new WeakMap<Equation, readonly GraphLayer[]>();

    async render(
        equation: Equation,
        viewport: Viewport,
        width: number,
        height: number,
        options: RenderOptions,
        isCurrent: () => boolean,
    ): Promise<ImageData | undefined> {
        let layers = this.#singleLayers.get(equation);
        if (!layers || layers[0]!.color.some((value, index) => value !== options.color[index])) {
            layers = [{ equation, color: options.color }];
            this.#singleLayers.set(equation, layers);
        }
        return this.renderLayers(layers, viewport, width, height, options, isCurrent);
    }

    async renderLayers(
        layers: readonly GraphLayer[],
        viewport: Viewport,
        width: number,
        height: number,
        options: RenderOptions,
        isCurrent: () => boolean,
    ): Promise<ImageData | undefined> {
        const device = await this.#getDevice();
        if (!isCurrent()) return;
        let source = this.#sources.get(layers);
        if (!source) {
            source = createGraphSceneShader(layers.map((layer) => layer.equation));
            this.#sources.set(layers, source);
        }
        const pipeline = await this.#getPipeline(device, source);
        if (!isCurrent()) return;
        const bytes = width * height * 4;
        if (
            bytes > device.limits.maxStorageBufferBindingSize ||
            bytes > device.limits.maxBufferSize
        ) {
            throw new Error(
                'The graph canvas exceeds GPU limits. Select CPU or reduce the window size.',
            );
        }
        // f32 cannot distinguish adjacent pixels at arbitrarily deep zooms.
        const spacing = Math.max(Math.abs(viewport.centerX), Math.abs(viewport.centerY)) * 2 ** -23;
        if (viewport.unitsPerPixel < spacing) {
            throw new Error('This zoom exceeds GPU precision. Select CPU or zoom out.');
        }
        const uniforms = new Float32Array([
            width,
            height,
            viewport.centerX,
            viewport.centerY,
            viewport.unitsPerPixel,
            options.lineWidth,
            0,
            0,
            ...layers.flatMap((layer) => [...layer.color, 0]),
        ]);
        if (
            !uniforms.every(Number.isFinite) ||
            Math.abs(viewport.centerX) > 1e20 ||
            Math.abs(viewport.centerY) > 1e20 ||
            !(uniforms[4]! > 1e-20 && uniforms[4]! < 1e20)
        ) {
            throw new Error('This view exceeds GPU precision. Select CPU or reset the view.');
        }
        const buffers: GPUBuffer[] = [];
        let mapped: GPUBuffer | undefined;
        device.pushErrorScope('validation');
        let scopeOpen = true;
        try {
            const allocate = (size: number, usage: number): GPUBuffer => {
                const buffer = device.createBuffer({ size, usage });
                buffers.push(buffer);
                return buffer;
            };
            const uniform = allocate(
                uniforms.byteLength,
                GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            );
            const output = allocate(bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
            const readback = allocate(bytes, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
            device.queue.writeBuffer(uniform, 0, uniforms);
            const group = device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: uniform } },
                    { binding: 1, resource: { buffer: output } },
                ],
            });
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, group);
            pass.dispatchWorkgroups(
                Math.ceil(width / GRAPH_WORKGROUP_SIZE),
                Math.ceil(height / GRAPH_WORKGROUP_SIZE),
            );
            pass.end();
            encoder.copyBufferToBuffer(output, 0, readback, 0, bytes);
            device.queue.submit([encoder.finish()]);
            const validation = device.popErrorScope();
            scopeOpen = false;
            const error = await validation;
            if (error) throw new Error(error.message);
            if (!isCurrent()) return;
            await readback.mapAsync(GPUMapMode.READ);
            mapped = readback;
            if (!isCurrent()) return;
            return new ImageData(
                new Uint8ClampedArray(readback.getMappedRange().slice(0)),
                width,
                height,
            );
        } finally {
            const closingScope = scopeOpen ? device.popErrorScope() : undefined;
            mapped?.unmap();
            buffers.forEach((buffer) => buffer.destroy());
            if (closingScope) await closingScope;
        }
    }

    #getDevice(): Promise<GPUDevice> {
        if (this.#device) return this.#device;
        const pending = (async () => {
            const adapter = await navigator.gpu?.requestAdapter();
            if (!adapter) throw new Error('WebGPU is unavailable. Select CPU to render graphs.');
            const device = await adapter.requestDevice();
            void device.lost.then(() => {
                if (this.#device === pending) {
                    this.#device = undefined;
                    this.#pipelines.clear();
                }
            });
            return device;
        })();
        this.#device = pending;
        void pending.catch(() => {
            if (this.#device === pending) this.#device = undefined;
        });
        return pending;
    }

    #getPipeline(device: GPUDevice, source: string): Promise<GPUComputePipeline> {
        const cached = this.#pipelines.get(source);
        if (cached) return cached;
        const pipeline = (async () => {
            const module = device.createShaderModule({ code: source });
            const info = await module.getCompilationInfo();
            const errors = info.messages.filter((message) => message.type === 'error');
            if (errors.length)
                throw new Error(
                    `Graph GPU shader: ${errors.map((error) => error.message).join('; ')}`,
                );
            const descriptor: GPUComputePipelineDescriptor = {
                layout: 'auto',
                compute: { module, entryPoint: 'main' },
            };
            if (device.createComputePipelineAsync)
                return device.createComputePipelineAsync(descriptor);
            device.pushErrorScope('validation');
            try {
                return device.createComputePipeline(descriptor);
            } finally {
                const error = await device.popErrorScope();
                if (error) throw new Error(error.message);
            }
        })();
        // Keep a small cache so editing equations never grows GPU resources indefinitely.
        if (this.#pipelines.size >= 8) this.#pipelines.delete(this.#pipelines.keys().next().value!);
        this.#pipelines.set(source, pipeline);
        void pipeline.catch(() => {
            if (this.#pipelines.get(source) === pipeline) this.#pipelines.delete(source);
        });
        return pipeline;
    }
}
