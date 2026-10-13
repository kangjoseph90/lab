import type { FractalViewport } from '../viewport';
import {
    DOUBLE_DOUBLE_SHADER,
    NUMBER_SHADER,
    PERTURBATION_SHADER,
    WORKGROUP_SIZE,
} from './gpu-shaders';
import { PerturbationOrbitFinder } from './perturbation-orbits';
import { splitDoubleDoubleForGpu, splitFloat } from './gpu-precision';
import type { FractalRenderWarning, RenderOptions } from './renderer';

const UNIFORM_BUFFER_SIZE = 20 * Float32Array.BYTES_PER_ELEMENT;

export class FractalGpuRenderer {
    readonly #canvas: HTMLCanvasElement;
    readonly #context: CanvasRenderingContext2D;
    #device: GPUDevice | undefined;
    #numberPipeline: GPUComputePipeline | undefined;
    #doubleDoublePipeline: GPUComputePipeline | undefined;
    #perturbationPipeline: GPUComputePipeline | undefined;
    readonly #orbitFinder = new PerturbationOrbitFinder();

    constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
        this.#canvas = canvas;
        this.#context = context;
    }

    async render(
        viewport: FractalViewport,
        options: RenderOptions,
        isCurrent: () => boolean,
    ): Promise<FractalRenderWarning | void> {
        const device = await this.#getDevice();
        const width = this.#canvas.width;
        const height = this.#canvas.height;
        const perturbation = options.perturbation
            ? this.#orbitFinder.createTileOrbits(
                  viewport,
                  width,
                  height,
                  options.maxIterations,
                  options.precision,
                  options.fractal,
              )
            : undefined;
        const activePerturbation =
            perturbation !== undefined && perturbation.anchorCount > 0 ? perturbation : undefined;
        const usePerturbation = activePerturbation !== undefined;
        const pipeline = await this.#getPipeline(device, options.precision, usePerturbation);
        const pixelBytes = width * height * 4;
        const uniformBuffer = device.createBuffer({
            size: UNIFORM_BUFFER_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const pixelBuffer = device.createBuffer({
            size: pixelBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const readBuffer = device.createBuffer({
            size: pixelBytes,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const orbitBuffer = activePerturbation
            ? device.createBuffer({
                  size: activePerturbation.orbit.byteLength,
                  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
              })
            : undefined;
        const anchorBuffer = activePerturbation
            ? device.createBuffer({
                  size: activePerturbation.anchors.byteLength,
                  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
              })
            : undefined;
        const centerX = splitDoubleDoubleForGpu(viewport.centerX);
        const centerY = splitDoubleDoubleForGpu(viewport.centerY);
        const unitsPerPixel = splitDoubleDoubleForGpu(viewport.unitsPerPixel);
        const juliaRe = splitFloat(options.fractal.type === 'julia' ? options.fractal.c.re : 0);
        const juliaIm = splitFloat(options.fractal.type === 'julia' ? options.fractal.c.im : 0);
        const uniforms = new Float32Array([
            width,
            height,
            options.maxIterations,
            options.fractal.type === 'julia' ? 1 : 0,
            centerX.hi,
            centerY.hi,
            unitsPerPixel.hi,
            0,
            centerX.lo,
            centerY.lo,
            unitsPerPixel.lo,
            0,
            options.fractal.type === 'julia' ? options.fractal.c.re : 0,
            options.fractal.type === 'julia' ? options.fractal.c.im : 0,
            juliaRe.lo,
            juliaIm.lo,
            activePerturbation?.tileSize ?? 0,
            activePerturbation?.tilesX ?? 0,
            0,
            0,
        ]);

        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        if (activePerturbation && orbitBuffer && anchorBuffer) {
            device.queue.writeBuffer(
                orbitBuffer,
                0,
                activePerturbation.orbit as Float32Array<ArrayBuffer>,
            );
            device.queue.writeBuffer(
                anchorBuffer,
                0,
                activePerturbation.anchors as Float32Array<ArrayBuffer>,
            );
        }

        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: pixelBuffer } },
                ...(orbitBuffer ? [{ binding: 2, resource: { buffer: orbitBuffer } }] : []),
                ...(anchorBuffer ? [{ binding: 3, resource: { buffer: anchorBuffer } }] : []),
            ],
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(
            Math.ceil(width / WORKGROUP_SIZE),
            Math.ceil(height / WORKGROUP_SIZE),
        );
        pass.end();
        encoder.copyBufferToBuffer(pixelBuffer, 0, readBuffer, 0, pixelBytes);
        device.queue.submit([encoder.finish()]);

        await readBuffer.mapAsync(GPUMapMode.READ);

        if (!isCurrent()) {
            readBuffer.unmap();
            uniformBuffer.destroy();
            pixelBuffer.destroy();
            readBuffer.destroy();
            orbitBuffer?.destroy();
            anchorBuffer?.destroy();
            return;
        }

        const pixels = new Uint8ClampedArray(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();
        const image = new ImageData(pixels, width, height);

        this.#context.putImageData(image, 0, 0);
        uniformBuffer.destroy();
        pixelBuffer.destroy();
        readBuffer.destroy();
        orbitBuffer?.destroy();
        anchorBuffer?.destroy();
        if (perturbation && !usePerturbation) return 'perturbation-anchor-unavailable';
    }

    async #getDevice(): Promise<GPUDevice> {
        if (this.#device) return this.#device;

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error('WebGPU is not supported.');

        this.#device = await adapter.requestDevice();
        return this.#device;
    }

    async #getPipeline(
        device: GPUDevice,
        precision: RenderOptions['precision'],
        usePerturbation: boolean,
    ): Promise<GPUComputePipeline> {
        if (usePerturbation) {
            if (this.#perturbationPipeline) return this.#perturbationPipeline;

            this.#perturbationPipeline = await createComputePipeline(device, PERTURBATION_SHADER);
            return this.#perturbationPipeline;
        }

        if (precision === 'double-double') {
            if (this.#doubleDoublePipeline) return this.#doubleDoublePipeline;

            this.#doubleDoublePipeline = await createComputePipeline(device, DOUBLE_DOUBLE_SHADER);
            return this.#doubleDoublePipeline;
        }

        if (this.#numberPipeline) return this.#numberPipeline;

        this.#numberPipeline = await createComputePipeline(device, NUMBER_SHADER);
        return this.#numberPipeline;
    }
}

function createComputePipeline(device: GPUDevice, code: string): Promise<GPUComputePipeline> {
    const descriptor: GPUComputePipelineDescriptor = {
        layout: 'auto',
        compute: {
            module: device.createShaderModule({ code }),
            entryPoint: 'main',
        },
    };
    const asyncDevice = device as GPUDevice & {
        createComputePipelineAsync?(
            descriptor: GPUComputePipelineDescriptor,
        ): Promise<GPUComputePipeline>;
    };

    return (
        asyncDevice.createComputePipelineAsync?.(descriptor) ??
        Promise.resolve(device.createComputePipeline(descriptor))
    );
}
