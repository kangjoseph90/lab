import './styles.css';
import { parseEquation } from './graph/equation';
import { GraphRenderer } from './graph/rendering/renderer';
import { DEFAULT_VIEWPORT, zoomAt } from './graph/viewport';
import type { Point, Viewport } from './graph/viewport';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('App root was not found.');

app.innerHTML = `
  <section class="calculator">
    <aside class="sidebar">
      <header class="brand">
        <span class="brand-mark">L</span>
        <div><strong>Graph Lab</strong><span>Implicit calculator</span></div>
      </header>
      <form class="expression-form" id="expression-form">
        <label for="expression">Equation</label>
        <div class="expression-row">
          <span class="color-swatch" aria-hidden="true"></span>
          <input id="expression" name="expression" value="x^2 + y^2 = 4" spellcheck="false" autocomplete="off" />
        </div>
        <p class="error" id="expression-error" role="alert"></p>
      </form>
      <div class="sidebar-note">x and y are the available variables.</div>
    </aside>
    <main class="plot-area">
      <canvas id="graph" aria-label="Graph canvas"></canvas>
      <div class="toolbar" aria-label="Graph controls">
        <button type="button" id="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" id="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
        <button type="button" id="reset" class="reset-button">Reset view</button>
      </div>
      <output class="coordinates" id="coordinates">x 0.00 · y 0.00</output>
      <div class="rendering" id="rendering">Rendering</div>
    </main>
  </section>
`;

const canvas = requireElement<HTMLCanvasElement>('#graph');
const form = requireElement<HTMLFormElement>('#expression-form');
const input = requireElement<HTMLInputElement>('#expression');
const error = requireElement<HTMLElement>('#expression-error');
const coordinates = requireElement<HTMLOutputElement>('#coordinates');
const rendering = requireElement<HTMLElement>('#rendering');
const graphRenderer = new GraphRenderer(canvas);
let viewport: Viewport = { ...DEFAULT_VIEWPORT };
let equation = parseEquation(input.value);
let dragStart: { point: Point; viewport: Viewport } | undefined;
let canvasScale = 1;
let inputTimer: number | undefined;
let renderRequest = 0;
graphRenderer.setEquation(equation);

function resizeCanvas(): void {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio, 1.5);
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    viewport = { ...viewport, unitsPerPixel: viewport.unitsPerPixel * (canvasScale / scale) };
    canvasScale = scale;
    scheduleRender();
}

function scheduleRender(): void {
    const request = ++renderRequest;
    rendering.classList.add('is-visible');

    void graphRenderer
        .render(viewport, { lineWidth: 1.35, color: [19, 105, 196] })
        .catch((cause: unknown) => {
            showError(cause);
        })
        .finally(() => {
            if (request === renderRequest) rendering.classList.remove('is-visible');
        });
}

function updateEquation(): void {
    try {
        equation = parseEquation(input.value);
        graphRenderer.setEquation(equation);
        error.textContent = '';
        input.removeAttribute('aria-invalid');
        scheduleRender();
    } catch (cause) {
        showError(cause);
    }
}

function showError(cause: unknown): void {
    error.textContent = cause instanceof Error ? cause.message : String(cause);
    input.setAttribute('aria-invalid', 'true');
}

function canvasPoint(event: PointerEvent | WheelEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (canvas.width / rect.width),
        y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
}

form.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(inputTimer);
    updateEquation();
});
input.addEventListener('input', () => {
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(updateEquation, 250);
});

canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    dragStart = { point: canvasPoint(event), viewport: { ...viewport } };
    graphRenderer.beginPan();
    canvas.classList.add('is-dragging');
});

canvas.addEventListener('pointermove', (event) => {
    const point = canvasPoint(event);
    coordinates.textContent = `x ${(viewport.centerX + (point.x - canvas.width / 2) * viewport.unitsPerPixel).toFixed(2)} · y ${(viewport.centerY - (point.y - canvas.height / 2) * viewport.unitsPerPixel).toFixed(2)}`;

    if (!dragStart) return;
    viewport = {
        ...dragStart.viewport,
        centerX:
            dragStart.viewport.centerX -
            (point.x - dragStart.point.x) * dragStart.viewport.unitsPerPixel,
        centerY:
            dragStart.viewport.centerY +
            (point.y - dragStart.point.y) * dragStart.viewport.unitsPerPixel,
    };
    graphRenderer.previewPan(point.x - dragStart.point.x, point.y - dragStart.point.y);
});

canvas.addEventListener('pointerup', (event) => {
    canvas.releasePointerCapture(event.pointerId);
    dragStart = undefined;
    canvas.classList.remove('is-dragging');
    scheduleRender();
});

canvas.addEventListener(
    'wheel',
    (event) => {
        event.preventDefault();
        viewport = zoomAt(
            viewport,
            canvasPoint(event),
            { x: canvas.width, y: canvas.height },
            Math.exp(event.deltaY * 0.001),
        );
        scheduleRender();
    },
    { passive: false },
);

requireElement<HTMLButtonElement>('#zoom-in').addEventListener('click', () => zoomFromCenter(0.75));
requireElement<HTMLButtonElement>('#zoom-out').addEventListener('click', () =>
    zoomFromCenter(1 / 0.75),
);
requireElement<HTMLButtonElement>('#reset').addEventListener('click', () => {
    viewport = { ...DEFAULT_VIEWPORT, unitsPerPixel: DEFAULT_VIEWPORT.unitsPerPixel / canvasScale };
    scheduleRender();
});

function zoomFromCenter(factor: number): void {
    viewport = zoomAt(
        viewport,
        { x: canvas.width / 2, y: canvas.height / 2 },
        { x: canvas.width, y: canvas.height },
        factor,
    );
    scheduleRender();
}

function requireElement<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    return element;
}

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(canvas);
