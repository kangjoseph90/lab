// All domain checks use finite bounds: WGSL may assume NaN/Infinity do not
// occur, so JS-style isFinite checks after an invalid operation are unsafe.
export const GRAPH_GPU_HELPERS = /* wgsl */ `
const LIMIT: f32 = 1e30;
const PI: f32 = 3.141592653589793;
struct Sample { value: f32, valid: bool }
fn invalid() -> Sample { return Sample(0.0, false); }
fn sample(v: f32) -> Sample {
    return Sample(v, (bitcast<u32>(v) & 0x7f800000u) != 0x7f800000u && abs(v) <= LIMIT);
}
fn scalar_add(a: Sample, b: Sample) -> Sample { return sample(a.value + b.value); }
fn scalar_mul(a: Sample, b: Sample) -> Sample {
    if (abs(b.value) > 1.0 && abs(a.value) > LIMIT / abs(b.value)) { return invalid(); }
    let result = sample(a.value * b.value);
    if (a.value != 0.0 && b.value != 0.0 && abs(result.value) < 1e-30) { return invalid(); }
    return result;
}
fn scalar_pow_int(a: Sample, exponent: i32) -> Sample {
    if (exponent == 0) { return sample(1.0); }
    var base = a;
    if (exponent < 0) {
        if (abs(base.value) < 1.0 / LIMIT) { return invalid(); }
        base = sample(1.0 / base.value);
    }
    var power = u32(abs(exponent));
    var result = sample(1.0);
    loop {
        if (power == 0u) { break; }
        if ((power & 1u) != 0u) {
            result = scalar_mul(result, base);
            if (!result.valid) { return invalid(); }
        }
        power >>= 1u;
        if (power != 0u) {
            base = scalar_mul(base, base);
            if (!base.valid) { return invalid(); }
        }
    }
    return result;
}
fn scalar_pow(a: Sample, b: Sample) -> Sample {
    if (b.value == 0.0) { return sample(1.0); }
    if (a.value == 0.0 && b.value > 0.0) { return sample(0.0); }
    if (a.value <= 0.0) { return invalid(); }
    let logarithm = scalar_mul(sample(log(a.value)), b);
    if (!logarithm.valid || abs(logarithm.value) > 69.0) { return invalid(); }
    return sample(exp(logarithm.value));
}
fn all_range() -> vec2f { return vec2f(-LIMIT, LIMIT); }
fn range_unknown(a: vec2f) -> bool { return any(abs(a) >= vec2f(LIMIT)); }
fn bounded_range(a: vec2f) -> vec2f {
    if (!sample(a.x).valid || !sample(a.y).valid) { return all_range(); }
    return a;
}
fn range_add(a: vec2f, b: vec2f) -> vec2f {
    if (range_unknown(a) || range_unknown(b)) { return all_range(); }
    return bounded_range(a + b);
}
fn range_mul(a: vec2f, b: vec2f) -> vec2f {
    if (all(a == vec2f(0.0)) || all(b == vec2f(0.0))) { return vec2f(0.0); }
    if (range_unknown(a) || range_unknown(b)) { return all_range(); }
    let p0 = scalar_mul(sample(a.x), sample(b.x));
    let p1 = scalar_mul(sample(a.x), sample(b.y));
    let p2 = scalar_mul(sample(a.y), sample(b.x));
    let p3 = scalar_mul(sample(a.y), sample(b.y));
    if (!p0.valid || !p1.valid || !p2.valid || !p3.valid) { return all_range(); }
    let values = vec4f(p0.value, p1.value, p2.value, p3.value);
    return vec2f(min(min(values.x, values.y), min(values.z, values.w)),
                 max(max(values.x, values.y), max(values.z, values.w)));
}
fn crosses_zero(a: vec2f) -> bool { return a.x <= 0.0 && a.y >= 0.0; }
fn range_pow(a: vec2f, exponent: i32) -> vec2f {
    if (exponent == 0) { return vec2f(1.0); }
    if (range_unknown(a) || (exponent < 0 && crosses_zero(a))) { return all_range(); }
    let lo = scalar_pow_int(sample(a.x), exponent);
    let hi = scalar_pow_int(sample(a.y), exponent);
    if (!lo.valid || !hi.valid) { return all_range(); }
    var result = vec2f(min(lo.value, hi.value), max(lo.value, hi.value));
    if (exponent > 0 && (exponent % 2) == 0 && crosses_zero(a)) { result.x = 0.0; }
    return result;
}
fn range_abs(a: vec2f) -> vec2f {
    return vec2f(select(min(abs(a.x), abs(a.y)), 0.0, crosses_zero(a)), max(abs(a.x), abs(a.y)));
}
fn periodic_point(a: vec2f, offset: f32, period: f32) -> bool {
    return ceil((a.x - offset) / period) <= floor((a.y - offset) / period);
}
fn range_sin(a: vec2f) -> vec2f {
    if (a.y - a.x >= 2.0 * PI || any(abs(a) > vec2f(1e6))) { return vec2f(-1.0, 1.0); }
    return vec2f(select(min(sin(a.x), sin(a.y)), -1.0, periodic_point(a, -PI / 2.0, 2.0 * PI)),
                 select(max(sin(a.x), sin(a.y)), 1.0, periodic_point(a, PI / 2.0, 2.0 * PI)));
}
fn range_cos(a: vec2f) -> vec2f {
    if (a.y - a.x >= 2.0 * PI || any(abs(a) > vec2f(1e6))) { return vec2f(-1.0, 1.0); }
    return vec2f(select(min(cos(a.x), cos(a.y)), -1.0, periodic_point(a, PI, 2.0 * PI)),
                 select(max(cos(a.x), cos(a.y)), 1.0, periodic_point(a, 0.0, 2.0 * PI)));
}
fn range_tan(a: vec2f) -> vec2f {
    if (range_unknown(a) || periodic_point(a, PI / 2.0, PI)) { return all_range(); }
    return bounded_range(vec2f(tan(a.x), tan(a.y)));
}
fn range_log(a: vec2f) -> vec2f {
    if (a.y <= 0.0 || range_unknown(a)) { return all_range(); }
    if (a.x <= 0.0) { return vec2f(-LIMIT, log(a.y)); }
    return log(a);
}
fn range_sqrt(a: vec2f) -> vec2f {
    if (a.y < 0.0 || range_unknown(a)) { return all_range(); }
    return sqrt(max(a, vec2f(0.0)));
}
fn range_exp(a: vec2f) -> vec2f {
    if (any(abs(a) > vec2f(69.0)) || range_unknown(a)) { return all_range(); }
    return bounded_range(exp(a));
}
fn range_asin(a: vec2f) -> vec2f {
    if (a.y < -1.0 || a.x > 1.0 || range_unknown(a)) { return all_range(); }
    return asin(clamp(a, vec2f(-1.0), vec2f(1.0)));
}
fn range_acos(a: vec2f) -> vec2f {
    if (a.y < -1.0 || a.x > 1.0 || range_unknown(a)) { return all_range(); }
    return acos(clamp(a.yx, vec2f(-1.0), vec2f(1.0)));
}
fn range_atan(a: vec2f) -> vec2f { return atan(a); }
fn range_sinh(a: vec2f) -> vec2f {
    if (any(abs(a) > vec2f(69.0))) { return all_range(); }
    return bounded_range(sinh(a));
}
fn range_cosh(a: vec2f) -> vec2f {
    if (any(abs(a) > vec2f(69.0))) { return all_range(); }
    let values = cosh(a);
    return vec2f(select(min(values.x, values.y), 1.0, crosses_zero(a)), max(values.x, values.y));
}
fn range_tanh(a: vec2f) -> vec2f { return tanh(a); }
fn range_floor(a: vec2f) -> vec2f { return floor(a); }
fn range_ceil(a: vec2f) -> vec2f { return ceil(a); }
fn range_round(a: vec2f) -> vec2f { return floor(a + vec2f(0.5)); }
`;

export const GRAPH_GPU_COVERAGE = /* wgsl */ `
fn nearby_zero(p: vec2f, threshold: f32) -> bool {
    let radius = threshold * 1.5;
    let range = equation_range(vec2f(p.x - radius, p.x + radius), vec2f(p.y - radius, p.y + radius));
    // Allow for f32 rounding in the interval expression.
    let tolerance = 4e-6 * max(abs(range.x), abs(range.y));
    return range.x <= tolerance && range.y >= -tolerance;
}
fn zero_distance(p: vec2f, initial: f32, threshold: f32) -> Sample {
    if (initial == 0.0) { return sample(0.0); }
    let radius = params.units * 4.0;
    var q = p;
    var value = initial;
    var residual = abs(value);
    let initial_residual = residual;
    for (var iteration = 0u; iteration <= 4u; iteration += 1u) {
        if (iteration > 0u && residual == 0.0) { return sample(distance(q, p)); }
        let dx = equation_dx(q.x, q.y);
        let dy = equation_dy(q.x, q.y);
        if (!dx.valid || !dy.valid || max(abs(dx.value), abs(dy.value)) > 1e15) { return invalid(); }
        let g = vec2f(dx.value, dy.value);
        let squared = dot(g, g);
        if (squared <= 1e-24) { return invalid(); }
        let estimated = residual / sqrt(squared);
        if (iteration == 0u && estimated > radius) { return invalid(); }
        if (iteration > 0u && residual <= initial_residual / 16.0 && estimated <= params.units * 0.1) {
            if (!nearby_zero(p, threshold)) { return invalid(); }
            return sample(distance(q, p) + estimated);
        }
        if (iteration == 4u) { return invalid(); }
        // residual/gradient has already been bounded by a few pixels. Reject
        // divergent steps before dividing by a tiny squared gradient.
        if (estimated > radius * 2.0) { return invalid(); }
        var step = (value / sqrt(squared)) * (g / sqrt(squared));
        var next = q - step;
        var next_value = equation_value(next.x, next.y);
        for (var backtrack = 0u; backtrack < 2u; backtrack += 1u) {
            if (!next_value.valid || abs(next_value.value) <= residual * 0.5) { break; }
            step *= 0.5;
            next = q - step;
            next_value = equation_value(next.x, next.y);
        }
        if (!next_value.valid || abs(next_value.value) > residual * 0.5 || distance(next, p) > radius) {
            return invalid();
        }
        q = next;
        value = next_value.value;
        residual = abs(value);
    }
    return invalid();
}
fn coverage(p: vec2f) -> f32 {
    let value = equation_value(p.x, p.y);
    if (!value.valid) { return 0.0; }
    if (RELATION == 1u) { return select(0.0, 0.2, value.value < 0.0); }
    if (RELATION == 3u) { return select(0.0, 0.2, value.value > 0.0); }
    let threshold = params.line_width * params.units;
    let result = zero_distance(p, value.value, threshold);
    if (RELATION == 0u) {
        if (!result.valid) { return 0.0; }
        return clamp(1.5 - result.value / threshold, 0.0, 1.0);
    }
    let inside = select(value.value >= 0.0, value.value <= 0.0, RELATION == 2u);
    if (!result.valid) { return select(0.0, 0.2, inside); }
    return clamp(0.5 + select(-result.value, result.value, inside) / params.units, 0.0, 1.0) * 0.2;
}
`;
