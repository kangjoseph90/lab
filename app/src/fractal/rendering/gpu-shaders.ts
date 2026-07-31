export const WORKGROUP_SIZE = 8;

export const NUMBER_SHADER = `
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

export const DOUBLE_DOUBLE_SHADER = `
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

export const PERTURBATION_SHADER = `
struct Params {
    size: vec4f,
    view: vec4f,
    view_lo: vec4f,
    julia: vec4f,
    perturbation: vec4f,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> pixels: array<u32>;
@group(0) @binding(2) var<storage, read> orbit: array<vec4f>;
@group(0) @binding(3) var<storage, read> anchors: array<vec4f>;

struct DD {
    hi: f32,
    lo: f32,
};

const SPLITTER: f32 = 4097.0;

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

fn orbit_re(index: u32) -> DD {
    let value = orbit[index];
    return DD(value.x, value.z);
}

fn orbit_im(index: u32) -> DD {
    let value = orbit[index];
    return DD(value.y, value.w);
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
    let tile_size = u32(params.perturbation.x);
    let tiles_x = u32(params.perturbation.y);
    let tile_x = id.x / tile_size;
    let tile_y = id.y / tile_size;
    let tile_index = tile_y * tiles_x + tile_x;
    let orbit_stride = max_iterations + 1u;
    let orbit_base = tile_index * orbit_stride;
    let anchor = anchors[tile_index];
    let reference_iterations = u32(anchor.z);

    let units_per_pixel = DD(params.view.z, params.view_lo.z);
    let delta_x = dd_mul(dd(f32(id.x) - anchor.x), units_per_pixel);
    let delta_y = dd_mul(dd(anchor.y - f32(id.y)), units_per_pixel);
    var dcx = delta_x;
    var dcy = delta_y;
    var dzx = dd(0.0);
    var dzy = dd(0.0);

    if (fractal_type == 1u) {
        dcx = dd(0.0);
        dcy = dd(0.0);
        dzx = delta_x;
        dzy = delta_y;
    }

    for (var iterations = 0u; iterations < max_iterations; iterations = iterations + 1u) {
        let orbit_index = orbit_base + iterations;
        let zx = dd_add(orbit_re(orbit_index), dzx);
        let zy = dd_add(orbit_im(orbit_index), dzy);
        let zx2 = dd_sqr(zx);
        let zy2 = dd_sqr(zy);

        if (dd_to_f32(dd_add(zx2, zy2)) > 4.0) {
            pixels[pixel] = colorize(1.0, smooth_escape(zx, zy, iterations));
            return;
        }

        if (fractal_type == 1u && iterations >= reference_iterations) {
            var direct_zx = zx;
            var direct_zy = zy;
            let cx = DD(params.julia.x, params.julia.z);
            let cy = DD(params.julia.y, params.julia.w);

            for (
                var direct_iterations = iterations;
                direct_iterations < max_iterations;
                direct_iterations = direct_iterations + 1u
            ) {
                let direct_zx2 = dd_sqr(direct_zx);
                let direct_zy2 = dd_sqr(direct_zy);

                if (dd_to_f32(dd_add(direct_zx2, direct_zy2)) > 4.0) {
                    pixels[pixel] = colorize(
                        1.0,
                        smooth_escape(direct_zx, direct_zy, direct_iterations),
                    );
                    return;
                }

                direct_zy = dd_add(dd_mul(dd(2.0), dd_mul(direct_zx, direct_zy)), cy);
                direct_zx = dd_add(dd_sub(direct_zx2, direct_zy2), cx);
            }

            let direct_zx2 = dd_sqr(direct_zx);
            let direct_zy2 = dd_sqr(direct_zy);

            if (dd_to_f32(dd_add(direct_zx2, direct_zy2)) > 4.0) {
                pixels[pixel] = colorize(
                    1.0,
                    smooth_escape(direct_zx, direct_zy, max_iterations),
                );
                return;
            }

            pixels[pixel] = colorize(0.0, 0.0);
            return;
        }

        let zre = orbit_re(orbit_index);
        let zim = orbit_im(orbit_index);
        let zre_dzy = dd_mul(zre, dzy);
        let zim_dzx = dd_mul(zim, dzx);
        let dzx_dzy = dd_mul(dzx, dzy);
        let next_dzy = dd_add(
            dd_add(dd_mul(dd(2.0), dd_add(zre_dzy, zim_dzx)), dd_mul(dd(2.0), dzx_dzy)),
            dcy,
        );
        let zre_dzx = dd_mul(zre, dzx);
        let zim_dzy = dd_mul(zim, dzy);
        let dzx2 = dd_sqr(dzx);
        let dzy2 = dd_sqr(dzy);
        let next_dzx = dd_add(
            dd_add(dd_mul(dd(2.0), dd_sub(zre_dzx, zim_dzy)), dd_sub(dzx2, dzy2)),
            dcx,
        );

        dzx = next_dzx;
        dzy = next_dzy;
    }

    let last_orbit_index = orbit_base + max_iterations;
    let zx = dd_add(orbit_re(last_orbit_index), dzx);
    let zy = dd_add(orbit_im(last_orbit_index), dzy);
    let zx2 = dd_sqr(zx);
    let zy2 = dd_sqr(zy);

    if (dd_to_f32(dd_add(zx2, zy2)) > 4.0) {
        pixels[pixel] = colorize(1.0, smooth_escape(zx, zy, max_iterations));
        return;
    }

    pixels[pixel] = colorize(0.0, 0.0);
}
`;
