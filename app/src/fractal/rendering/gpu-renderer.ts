import type { Viewport } from '../../graph/viewport';
import type { RenderOptions } from './renderer';

const WORKGROUP_SIZE = 8;

const NUMBER_SHADER = `
struct Params {
    size: vec4f,
    view: vec4f,
    view_lo: vec4f,
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

const DOUBLE_DOUBLE_SHADER = `
struct Params {
    size: vec4f,
    view: vec4f,
    view_lo: vec4f,
    julia: vec4f,
};

struct DD {
    hi: f32,
    lo: f32,
};

const SPLITTER: f32 = 4097.0;

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> pixels: array<u32>;

fn dd(a: f32) -> DD {
    return DD(a, 0.0);
}

fn quick_two_sum(a: f32, b: f32) -> DD {
    let hi = a + b;
    return DD(hi, b - (hi - a));
}

fn two_sum(a: f32, b: f32) -> DD {
    let hi = a + b;
    let bb = hi - a;
    return DD(hi, a - (hi - bb) + (b - bb));
}

fn split(a: f32) -> DD {
    let c = SPLITTER * a;
    let hi = c - (c - a);
    return DD(hi, a - hi);
}

fn two_product(a: f32, b: f32) -> DD {
    let hi = a * b;
    let a_split = split(a);
    let b_split = split(b);
    let lo = a_split.hi * b_split.hi -
        hi +
        a_split.hi * b_split.lo +
        a_split.lo * b_split.hi +
        a_split.lo * b_split.lo;

    return DD(hi, lo);
}

fn dd_add(a: DD, b: DD) -> DD {
    let sum = two_sum(a.hi, b.hi);
    return quick_two_sum(sum.hi, a.lo + b.lo + sum.lo);
}

fn dd_neg(a: DD) -> DD {
    return DD(-a.hi, -a.lo);
}

fn dd_sub(a: DD, b: DD) -> DD {
    return dd_add(a, dd_neg(b));
}

fn dd_mul(a: DD, b: DD) -> DD {
    let product = two_product(a.hi, b.hi);
    let lo = a.hi * b.lo + a.lo * b.hi + product.lo;
    return quick_two_sum(product.hi, lo);
}

fn dd_sqr(a: DD) -> DD {
    return dd_mul(a, a);
}

fn dd_to_f32(a: DD) -> f32 {
    return a.hi + a.lo;
}

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

fn smooth_escape(zx: DD, zy: DD, iterations: u32) -> f32 {
    let magnitude = length(vec2f(dd_to_f32(zx), dd_to_f32(zy)));

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
    let x_offset = dd(f32(id.x) - params.size.x * 0.5);
    let y_offset = dd(f32(id.y) - params.size.y * 0.5);
    let units_per_pixel = DD(params.view.z, params.view_lo.z);
    let x = dd_add(DD(params.view.x, params.view_lo.x), dd_mul(x_offset, units_per_pixel));
    let y = dd_sub(DD(params.view.y, params.view_lo.y), dd_mul(y_offset, units_per_pixel));
    var zx = dd(0.0);
    var zy = dd(0.0);
    var cx = x;
    var cy = y;

    if (fractal_type == 1u) {
        zx = x;
        zy = y;
        cx = DD(params.julia.x, params.julia.z);
        cy = DD(params.julia.y, params.julia.w);
    }

    for (var iterations = 0u; iterations < max_iterations; iterations = iterations + 1u) {
        let zx2 = dd_sqr(zx);
        let zy2 = dd_sqr(zy);

        if (dd_to_f32(dd_add(zx2, zy2)) > 4.0) {
            pixels[pixel] = colorize(1.0, smooth_escape(zx, zy, iterations));
            return;
        }

        zy = dd_add(dd_add(dd_mul(zx, zy), dd_mul(zx, zy)), cy);
        zx = dd_add(dd_sub(zx2, zy2), cx);
    }

    let zx2 = dd_sqr(zx);
    let zy2 = dd_sqr(zy);

    if (dd_to_f32(dd_add(zx2, zy2)) > 4.0) {
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
    #numberPipeline: GPUComputePipeline | undefined;
    #doubleDoublePipeline: GPUComputePipeline | undefined;

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
        const pipeline = await this.#getPipeline(device, options.precision);
        const width = this.#canvas.width;
        const height = this.#canvas.height;
        const pixelBytes = width * height * 4;
        const uniformBuffer = device.createBuffer({
            size: 64,
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
        const centerX = splitFloat(viewport.centerX);
        const centerY = splitFloat(viewport.centerY);
        const unitsPerPixel = splitFloat(viewport.unitsPerPixel);
        const juliaRe = splitFloat(options.fractal.type === 'julia' ? options.fractal.c.re : 0);
        const juliaIm = splitFloat(options.fractal.type === 'julia' ? options.fractal.c.im : 0);
        const uniforms = new Float32Array([
            width,
            height,
            options.maxIterations,
            options.fractal.type === 'julia' ? 1 : 0,
            viewport.centerX,
            viewport.centerY,
            viewport.unitsPerPixel,
            0,
            centerX.lo,
            centerY.lo,
            unitsPerPixel.lo,
            0,
            options.fractal.type === 'julia' ? options.fractal.c.re : 0,
            options.fractal.type === 'julia' ? options.fractal.c.im : 0,
            juliaRe.lo,
            juliaIm.lo,
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

    async #getPipeline(
        device: GPUDevice,
        precision: RenderOptions['precision'],
    ): Promise<GPUComputePipeline> {
        if (precision === 'double-double') {
            if (this.#doubleDoublePipeline) return this.#doubleDoublePipeline;

            this.#doubleDoublePipeline = device.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: device.createShaderModule({ code: DOUBLE_DOUBLE_SHADER }),
                    entryPoint: 'main',
                },
            });
            return this.#doubleDoublePipeline;
        }

        if (this.#numberPipeline) return this.#numberPipeline;

        this.#numberPipeline = device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: device.createShaderModule({ code: NUMBER_SHADER }),
                entryPoint: 'main',
            },
        });
        return this.#numberPipeline;
    }
}

function splitFloat(value: number): { hi: number; lo: number } {
    const hi = Math.fround(value);
    return { hi, lo: Math.fround(value - hi) };
}
