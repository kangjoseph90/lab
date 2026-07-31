import type { Viewport } from '../../graph/viewport';
import type { RenderOptions } from './renderer';

const WORKGROUP_SIZE = 8;

const SHADER = `
struct Params {
    size: vec4f,
    view: vec4f,
    julia: vec4f,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> pixels: array<u32>;

fn colorize(status: f32, smooth_iteration: f32) -> u32 {
    if (status == 0.0) {
        return pack4x8unorm(vec4f(18.0 / 255.0, 20.0 / 255.0, 22.0 / 255.0, 1.0));
    }

    let wave = 0.5 + 0.5 * cos(smooth_iteration * 0.12);
    let r = (35.0 + 145.0 * wave) / 255.0;
    let g = (82.0 + 112.0 * (1.0 - wave)) / 255.0;
    let b_wave = sin(smooth_iteration * 0.08);
    let b = (128.0 + 80.0 * b_wave * b_wave) / 255.0;

    return pack4x8unorm(vec4f(r, g, b, 1.0));
}

fn smooth_escape(zx: f32, zy: f32, iterations: u32) -> f32 {
    let magnitude = length(vec2f(zx, zy));

    if (magnitude <= 1.0) {
        return f32(iterations);
    }

    return f32(iterations) + 1.0 - log(log(magnitude)) / log(2.0);
}

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3u) {
    let width = u32(params.size.x);
    let height = u32(params.size.y);

    if (id.x >= width || id.y >= height) {
        return;
    }

    let max_iterations = u32(params.size.z);
    let fractal_type = u32(params.size.w);
    let pixel = id.y * width + id.x;
    let x = params.view.x + (f32(id.x) - params.size.x * 0.5) * params.view.z;
    let y = params.view.y - (f32(id.y) - params.size.y * 0.5) * params.view.z;
    var zx = select(0.0, x, fractal_type == 1u);
    var zy = select(0.0, y, fractal_type == 1u);
    let cx = select(x, params.julia.x, fractal_type == 1u);
    let cy = select(y, params.julia.y, fractal_type == 1u);

    for (var iterations = 0u; iterations < max_iterations; iterations = iterations + 1u) {
        let zx2 = zx * zx;
        let zy2 = zy * zy;

        if (zx2 + zy2 > 4.0) {
            pixels[pixel] = colorize(1.0, smooth_escape(zx, zy, iterations));
            return;
        }

        zy = 2.0 * zx * zy + cy;
        zx = zx2 - zy2 + cx;
    }

    let zx2 = zx * zx;
    let zy2 = zy * zy;

    if (zx2 + zy2 > 4.0) {
        pixels[pixel] = colorize(1.0, smooth_escape(zx, zy, max_iterations));
        return;
    }

    pixels[pixel] = colorize(0.0, 0.0);
}
`;

export class FractalGpuRenderer {
    readonly #canvas: HTMLCanvasElement;
    readonly #context: CanvasRenderingContext2D;
    #device: GPUDevice | undefined;
    #pipeline: GPUComputePipeline | undefined;

    constructor(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
        this.#canvas = canvas;
        this.#context = context;
    }

    async render(
        viewport: Viewport,
        options: RenderOptions,
        isCurrent: () => boolean,
    ): Promise<void> {
        const device = await this.#getDevice();
        const pipeline = await this.#getPipeline(device);
        const width = this.#canvas.width;
        const height = this.#canvas.height;
        const pixelBytes = width * height * 4;
        const uniformBuffer = device.createBuffer({
            size: 48,
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
        const uniforms = new Float32Array([
            width,
            height,
            options.maxIterations,
            options.fractal.type === 'julia' ? 1 : 0,
            viewport.centerX,
            viewport.centerY,
            viewport.unitsPerPixel,
            0,
            options.fractal.type === 'julia' ? options.fractal.c.re : 0,
            options.fractal.type === 'julia' ? options.fractal.c.im : 0,
            0,
            0,
        ]);

        device.queue.writeBuffer(uniformBuffer, 0, uniforms);

        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: pixelBuffer } },
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
            return;
        }

        const pixels = new Uint8ClampedArray(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();
        const image = new ImageData(pixels, width, height);

        this.#context.putImageData(image, 0, 0);
        uniformBuffer.destroy();
        pixelBuffer.destroy();
        readBuffer.destroy();
    }

    async #getDevice(): Promise<GPUDevice> {
        if (this.#device) return this.#device;

        const adapter = await navigator.gpu?.requestAdapter();
        if (!adapter) throw new Error('WebGPU is not supported.');

        this.#device = await adapter.requestDevice();
        return this.#device;
    }

    async #getPipeline(device: GPUDevice): Promise<GPUComputePipeline> {
        if (this.#pipeline) return this.#pipeline;

        this.#pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: device.createShaderModule({ code: SHADER }),
                entryPoint: 'main',
            },
        });
        return this.#pipeline;
    }
}
