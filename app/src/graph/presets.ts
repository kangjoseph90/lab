import type { Point, Viewport } from './viewport';

export type PresetDomain = 'real' | 'complex';
export type GraphPreset = {
    id: string;
    domain: PresetDomain;
    group: string;
    name: string;
    expression: string;
    description: string;
    view: { centerX: number; centerY: number; spanX: number; spanY: number };
};

const originView = (spanX: number, spanY = spanX) => ({ centerX: 0, centerY: 0, spanX, spanY });
const q = '(re(z - 0.25)^2 + im(z)^2)';
// q(q + Re(c) - 1/4) <= Im(c)^2/4 is the main cardioid.
// The period-2 component is the disk |c + 1| <= 1/4. Their
// interiors are disjoint, so multiplying the signed region expressions
// gives their union. Here the graph variable z is the Mandelbrot parameter c.
// Reference: https://www.ibiblio.org/e-notes/MSet/attractor.htm
const cardioid = `${q} * (${q} + re(z - 0.25)) - 0.25 * im(z)^2`;
const periodTwo = '(re(z + 1)^2 + im(z)^2 - 0.0625)';

export const GRAPH_PRESETS: readonly GraphPreset[] = [
    {
        id: 'circle',
        domain: 'real',
        group: '대표 그래프',
        name: '원',
        expression: 'x^2 + y^2 = 4',
        description: '원점에서 거리가 2인 점들. 가장 기본적인 암시적 곡선입니다.',
        view: originView(5.5),
    },
    {
        id: 'line',
        domain: 'real',
        group: '대표 그래프',
        name: '직선',
        expression: 'y = 0.5 * x + 1',
        description: '기울기 0.5, y절편 1인 직선입니다.',
        view: originView(8, 6),
    },
    {
        id: 'parabola',
        domain: 'real',
        group: '대표 그래프',
        name: '포물선',
        expression: 'y = x^2',
        description: '원점이 꼭짓점인 포물선. 위로 열린 대칭 곡선입니다.',
        view: { centerX: 0, centerY: 2, spanX: 6, spanY: 7 },
    },
    {
        id: 'ellipse',
        domain: 'real',
        group: '대표 그래프',
        name: '타원',
        expression: 'x^2 / 9 + y^2 / 4 = 1',
        description: '가로 반지름 3, 세로 반지름 2인 타원입니다.',
        view: originView(8, 6),
    },
    {
        id: 'hyperbola',
        domain: 'real',
        group: '대표 그래프',
        name: '쌍곡선',
        expression: 'x^2 - y^2 = 1',
        description: '좌우로 열린 두 갈래 곡선. y = ±x에 점점 가까워집니다.',
        view: originView(8, 6),
    },
    {
        id: 'sine',
        domain: 'real',
        group: '대표 그래프',
        name: '사인파',
        expression: 'y = sin(x)',
        description: '진폭 1의 주기적인 파동입니다. 이동하면서 반복 구조를 살펴보세요.',
        view: originView(14, 5),
    },
    {
        id: 'heart',
        domain: 'real',
        group: '흥미로운 곡선',
        name: '하트',
        expression: '(x^2 + y^2 - 1)^3 = x^2 * y^3',
        description: '다항식 하나로 그리는 하트. 위쪽의 두 봉우리와 아래쪽 뾰족한 끝을 보세요.',
        view: { centerX: 0, centerY: 0.2, spanX: 3.3, spanY: 3.4 },
    },
    {
        id: 'folium',
        domain: 'real',
        group: '흥미로운 곡선',
        name: '데카르트의 잎',
        expression: 'x^3 + y^3 = 3 * x * y',
        description: '작은 잎 모양의 고리와 멀리 뻗는 가지가 함께 나타나는 3차 곡선입니다.',
        view: { centerX: 0.5, centerY: 0.5, spanX: 5, spanY: 5 },
    },
    {
        id: 'clover',
        domain: 'real',
        group: '흥미로운 곡선',
        name: '네 잎 클로버',
        expression: '(x^2 + y^2)^3 = 4 * x^2 * y^2',
        description: '대각선 방향으로 네 장의 꽃잎이 펼쳐지는 장미 곡선입니다.',
        view: originView(2.6),
    },
    {
        id: 'astroid',
        domain: 'real',
        group: '흥미로운 곡선',
        name: '아스트로이드',
        expression: '(x^2 + y^2 - 1)^3 + 27 * x^2 * y^2 = 0',
        description: '네 개의 뾰족한 꼭짓점을 가진 별 모양 곡선입니다.',
        view: originView(2.8),
    },
    {
        id: 'interference',
        domain: 'real',
        group: '흥미로운 곡선',
        name: '코사인 간섭 무늬',
        expression: 'cos(x) + cos(y) = 0.5',
        description: '두 방향의 파동이 만드는 둥근 격자 무늬. 축소하면 반복 패턴이 드러납니다.',
        view: originView(18, 14),
    },
    {
        id: 'hyperbolic-grid',
        domain: 'real',
        group: '흥미로운 곡선',
        name: '쌍곡선 격자',
        expression: 'sin(x * y) = 0',
        description: 'x·y가 π의 정수배인 곡선들이 겹칩니다. 바깥으로 갈수록 무늬가 촘촘해집니다.',
        view: originView(10, 8),
    },
    {
        id: 'mandelbrot-cardioid',
        domain: 'complex',
        group: 'Mandelbrot 영역',
        name: '큰 하트 · 메인 카디오이드',
        expression: `${cardioid} <= 0`,
        description:
            'Mandelbrot의 주기 1 영역과 경계. 여기서 z는 반복값이 아니라 매개변수 c입니다.',
        view: { centerX: -0.25, centerY: 0, spanX: 1.8, spanY: 1.8 },
    },
    {
        id: 'mandelbrot-period-2',
        domain: 'complex',
        group: 'Mandelbrot 영역',
        name: '주기 2 · 원형 bulb',
        expression: 'abs(z + 1) <= 0.25',
        description: '중심 −1, 반지름 1/4인 주기 2 영역. 궤도가 두 값 사이를 번갈아 오갑니다.',
        view: { centerX: -1, centerY: 0, spanX: 0.9, spanY: 0.9 },
    },
    {
        id: 'mandelbrot-main-regions',
        domain: 'complex',
        group: 'Mandelbrot 영역',
        name: '주기 1 + 2 영역',
        expression: `(${cardioid}) * ${periodTwo} <= 0`,
        description:
            '메인 카디오이드와 주기 2 bulb의 합집합. −3/4에서 맞닿는 두 영역을 함께 봅니다.',
        view: { centerX: -0.45, centerY: 0, spanX: 2.2, spanY: 1.8 },
    },
    {
        id: 'mandelbrot-escape-3',
        domain: 'complex',
        group: 'Mandelbrot 영역',
        name: '3회 반복 · 근사 영역',
        expression: 'abs((z^2 + z)^2 + z) <= 2',
        description:
            '0에서 zₙ₊₁ = zₙ² + c를 3회 반복했을 때 |z₃| ≤ 2인 영역입니다. Mandelbrot 전체의 유한 반복 근사입니다.',
        view: { centerX: -0.4, centerY: 0, spanX: 4.2, spanY: 3.6 },
    },
    {
        id: 'complex-lemniscate',
        domain: 'complex',
        group: '흥미로운 복소 곡선',
        name: '복소수로 그리는 ∞',
        expression: 'abs(z^2 - 1) = 1',
        description: 'z²을 거쳐 원을 되짚으면 나타나는 렘니스케이트. 두 고리가 원점에서 만납니다.',
        view: originView(4, 3),
    },
    {
        id: 'complex-trefoil',
        domain: 'complex',
        group: '흥미로운 복소 곡선',
        name: '세 갈래 꽃잎',
        expression: 'abs(z^3 - 1) = 1',
        description: '세제곱 함수가 만드는 3중 대칭. 원점에서 세 개의 고리가 만납니다.',
        view: originView(3.6),
    },
    {
        id: 'complex-sine',
        domain: 'complex',
        group: '흥미로운 복소 곡선',
        name: '복소 사인의 구슬 사슬',
        expression: 'abs(sin(z)) = 1',
        description: '실수 방향으로 반복되는 고리들. 복소 사인의 크기가 1인 점들을 연결합니다.',
        view: originView(12, 4),
    },
    {
        id: 'complex-exponential',
        domain: 'complex',
        group: '흥미로운 복소 곡선',
        name: '지수 함수의 반복 가지',
        expression: 're(exp(z)) = 1',
        description: 'eˣ cos(y) = 1인 곡선. 허수 방향으로 반복되며 오른쪽으로 펼쳐집니다.',
        view: { centerX: 1.5, centerY: 0, spanX: 7, spanY: 16 },
    },
    {
        id: 'complex-inversion',
        domain: 'complex',
        group: '흥미로운 복소 곡선',
        name: '역수 변환이 만드는 원',
        expression: 're(1 / z) = 0.5',
        description:
            '역수의 실수부를 고정하면 원이 나타납니다. z = 0에서는 역수가 정의되지 않습니다.',
        view: { centerX: 1, centerY: 0, spanX: 3.5, spanY: 3.5 },
    },
    {
        id: 'complex-cubic',
        domain: 'complex',
        group: '흥미로운 복소 곡선',
        name: '세제곱의 실수부 등고선',
        expression: 're(z^3) = 1',
        description: 'x³ − 3xy² = 1. 복소 세제곱이 만드는 세 갈래의 열린 곡선입니다.',
        view: originView(7, 6),
    },
];

export function presetViewport(preset: GraphPreset, size: Point): Viewport {
    return {
        centerX: preset.view.centerX,
        centerY: preset.view.centerY,
        unitsPerPixel: Math.max(
            preset.view.spanX / Math.max(1, size.x),
            preset.view.spanY / Math.max(1, size.y),
        ),
    };
}
