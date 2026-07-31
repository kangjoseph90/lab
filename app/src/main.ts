import './styles.css';
import { FractalRenderer } from './fractal/rendering/renderer';
import { parseEquation } from './graph/equation';
import { GraphRenderer } from './graph/rendering/renderer';
import { DEFAULT_VIEWPORT, zoomAt } from './graph/viewport';
import type { Point, Viewport } from './graph/viewport';

type Mode = 'graph' | 'fractal';

const FRACTAL_VIEWPORT: Viewport = {
    centerX: -0.5,
    centerY: 0,
    unitsPerPixel: 0.005,
};

const JULIA_VIEWPORT: Viewport = {
    centerX: 0,
    centerY: 0,
    unitsPerPixel: 0.005,
};

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('App root was not found.');

app.innerHTML = `
  <section class="calculator">
    <aside class="sidebar">
      <header class="brand">
        <span class="brand-mark">L</span>
        <div><strong id="project-title">Graph Lab</strong><span id="project-subtitle">Implicit calculator</span></div>
      </header>
      <div class="mode-switch" aria-label="Project">
        <button type="button" id="mode-graph" class="is-active">Graph</button>
        <button type="button" id="mode-fractal">Fractal</button>
      </div>
      <form class="expression-form" id="expression-form">
        <label for="expression">Equation</label>
        <div class="expression-row">
          <span class="color-swatch" aria-hidden="true"></span>
          <input id="expression" name="expression" value="x^2 + y^2 = 4" spellcheck="false" autocomplete="off" />
        </div>
        <p class="error" id="expression-error" role="alert"></p>
      </form>
      <section class="fractal-panel is-hidden" id="fractal-panel">
        <div class="field">
          <label for="fractal-type">Type</label>
          <select id="fractal-type" name="fractal-type">
            <option value="mandelbrot">Mandelbrot</option>
            <option value="julia">Julia</option>
          </select>
        </div>
        <div class="field">
          <label for="fractal-precision">Precision</label>
          <select id="fractal-precision" name="fractal-precision">
            <option value="number">Number</option>
            <option value="double-double">Double-double</option>
          </select>
        </div>
        <div class="field">
          <label for="fractal-backend">Backend</label>
          <select id="fractal-backend" name="fractal-backend">
            <option value="gpu">GPU</option>
            <option value="cpu">CPU</option>
          </select>
        </div>
        <div class="julia-fields is-hidden" id="julia-fields">
          <div class="field">
            <label for="julia-real">Julia c real</label>
            <input id="julia-real" name="julia-real" type="number" step="0.001" value="-0.8" />
          </div>
          <div class="field">
            <label for="julia-imag">Julia c imag</label>
            <input id="julia-imag" name="julia-imag" type="number" step="0.001" value="0.156" />
          </div>
        </div>
        <div class="field">
          <label for="max-iterations">Iterations</label>
          <input id="max-iterations" name="max-iterations" type="number" min="16" max="4096" step="16" value="256" />
        </div>
        <p class="fractal-name" id="fractal-name">Mandelbrot set</p>
      </section>
      <div class="sidebar-note" id="sidebar-note">x, y, and real-valued z expressions are available.</div>
    </aside>
    <main class="plot-area">
      <canvas id="graph" aria-label="Graph canvas"></canvas>
      <div class="toolbar" aria-label="Graph controls">
        <button type="button" id="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" id="zoom-out" aria-label="Zoom out" title="Zoom out">-</button>
        <button type="button" id="reset" class="reset-button">Reset view</button>
      </div>
      <output class="coordinates" id="coordinates">x 0.00 / y 0.00</output>
      <div class="rendering" id="rendering">Rendering</div>
    </main>
  </section>
`;

const canvas = requireElement<HTMLCanvasElement>('#graph');
const form = requireElement<HTMLFormElement>('#expression-form');
const input = requireElement<HTMLInputElement>('#expression');
const error = requireElement<HTMLElement>('#expression-error');
const fractalPanel = requireElement<HTMLElement>('#fractal-panel');
const graphModeButton = requireElement<HTMLButtonElement>('#mode-graph');
const fractalModeButton = requireElement<HTMLButtonElement>('#mode-fractal');
const fractalTypeInput = requireElement<HTMLSelectElement>('#fractal-type');
const fractalPrecisionInput = requireElement<HTMLSelectElement>('#fractal-precision');
const fractalBackendInput = requireElement<HTMLSelectElement>('#fractal-backend');
const juliaFields = requireElement<HTMLElement>('#julia-fields');
const juliaRealInput = requireElement<HTMLInputElement>('#julia-real');
const juliaImagInput = requireElement<HTMLInputElement>('#julia-imag');
const maxIterationsInput = requireElement<HTMLInputElement>('#max-iterations');
const fractalName = requireElement<HTMLElement>('#fractal-name');
const projectTitle = requireElement<HTMLElement>('#project-title');
const projectSubtitle = requireElement<HTMLElement>('#project-subtitle');
const sidebarNote = requireElement<HTMLElement>('#sidebar-note');
const coordinates = requireElement<HTMLOutputElement>('#coordinates');
const rendering = requireElement<HTMLElement>('#rendering');
const graphRenderer = new GraphRenderer(canvas);
const fractalRenderer = new FractalRenderer(canvas);
let activeMode: Mode = 'graph';
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
    const render =
        activeMode === 'graph'
            ? graphRenderer.render(viewport, { lineWidth: 1.35, color: [19, 105, 196] })
            : fractalRenderer.render(viewport, {
                  fractal: readFractalConfig(),
                  maxIterations: readMaxIterations(),
                  precision: readFractalPrecision(),
                  backend: readFractalBackend(),
              });

    void render
        .catch((cause: unknown) => {
            showError(cause);
        })
        .finally(() => {
            if (request === renderRequest) rendering.classList.remove('is-visible');
        });
}

function updateEquation(): void {
    if (activeMode !== 'graph') return;

    try {
        equation = parseEquation(input.value);
        graphRenderer.setEquation(equation);
        clearError();
        scheduleRender();
    } catch (cause) {
        showError(cause);
    }
}

function showError(cause: unknown): void {
    error.textContent = cause instanceof Error ? cause.message : String(cause);
    input.setAttribute('aria-invalid', 'true');
}

function clearError(): void {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
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
    currentRenderer().beginPan();
    canvas.classList.add('is-dragging');
});

canvas.addEventListener('pointermove', (event) => {
    const point = canvasPoint(event);
    coordinates.textContent = `x ${(viewport.centerX + (point.x - canvas.width / 2) * viewport.unitsPerPixel).toFixed(2)} / y ${(viewport.centerY - (point.y - canvas.height / 2) * viewport.unitsPerPixel).toFixed(2)}`;

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
    currentRenderer().previewPan(point.x - dragStart.point.x, point.y - dragStart.point.y);
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
    resetViewport();
    scheduleRender();
});

graphModeButton.addEventListener('click', () => setMode('graph'));
fractalModeButton.addEventListener('click', () => setMode('fractal'));
fractalTypeInput.addEventListener('change', () => {
    updateFractalControls();
    if (activeMode === 'fractal') {
        resetViewport();
        scheduleRender();
    }
});
[fractalPrecisionInput, fractalBackendInput].forEach((control) => {
    control.addEventListener('change', () => {
        updateFractalControls();
        if (activeMode === 'fractal') scheduleRender();
    });
});
[juliaRealInput, juliaImagInput, maxIterationsInput].forEach((control) => {
    control.addEventListener('input', () => {
        updateFractalControls();
        if (activeMode === 'fractal') scheduleRender();
    });
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

function setMode(mode: Mode): void {
    if (mode === activeMode) return;

    currentRenderer().cancel();
    activeMode = mode;
    resetViewport();
    graphModeButton.classList.toggle('is-active', activeMode === 'graph');
    fractalModeButton.classList.toggle('is-active', activeMode === 'fractal');
    form.classList.toggle('is-hidden', activeMode !== 'graph');
    fractalPanel.classList.toggle('is-hidden', activeMode !== 'fractal');
    projectTitle.textContent = activeMode === 'graph' ? 'Graph Lab' : 'Fractal Lab';
    updateFractalControls();
    sidebarNote.textContent =
        activeMode === 'graph'
            ? 'x, y, and real-valued z expressions are available.'
            : 'Drag to pan. Scroll or use controls to zoom.';
    clearError();
    scheduleRender();
}

function currentRenderer(): Pick<GraphRenderer, 'beginPan' | 'cancel' | 'previewPan'> {
    return activeMode === 'graph' ? graphRenderer : fractalRenderer;
}

function readMaxIterations(): number {
    const value = Number.parseInt(maxIterationsInput.value, 10);

    if (!Number.isFinite(value)) return 256;

    return Math.max(16, Math.min(4096, value));
}

function readFractalConfig() {
    if (fractalTypeInput.value === 'julia') {
        return {
            type: 'julia' as const,
            c: {
                re: readNumber(juliaRealInput, -0.8),
                im: readNumber(juliaImagInput, 0.156),
            },
        };
    }

    return { type: 'mandelbrot' as const };
}

function readFractalPrecision() {
    return fractalPrecisionInput.value === 'double-double' ? 'double-double' : 'number';
}

function readFractalBackend() {
    return fractalBackendInput.value === 'cpu' ? 'cpu' : 'gpu';
}

function readNumber(inputElement: HTMLInputElement, fallback: number): number {
    const value = Number.parseFloat(inputElement.value);
    return Number.isFinite(value) ? value : fallback;
}

function currentFractalViewport(): Viewport {
    return fractalTypeInput.value === 'julia' ? JULIA_VIEWPORT : FRACTAL_VIEWPORT;
}

function resetViewport(): void {
    const base = activeMode === 'graph' ? DEFAULT_VIEWPORT : currentFractalViewport();
    viewport = { ...base, unitsPerPixel: base.unitsPerPixel / canvasScale };
}

function updateFractalControls(): void {
    const isJulia = fractalTypeInput.value === 'julia';
    const cRe = readNumber(juliaRealInput, -0.8);
    const cIm = readNumber(juliaImagInput, 0.156);

    const precision = readFractalPrecision();
    const precisionLabel = precision === 'double-double' ? 'double-double' : 'number';
    const backend = readFractalBackend();
    const backendLabel = backend === 'gpu' ? 'GPU' : 'CPU';

    juliaFields.classList.toggle('is-hidden', !isJulia);
    fractalName.textContent = isJulia
        ? `Julia set, c = ${cRe.toFixed(3)} + ${cIm.toFixed(3)}i, ${precisionLabel}, ${backendLabel}`
        : `Mandelbrot set, ${precisionLabel}, ${backendLabel}`;
    projectSubtitle.textContent =
        activeMode === 'graph'
            ? 'Implicit calculator'
            : isJulia
              ? 'Julia explorer'
              : 'Mandelbrot explorer';
}

function requireElement<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Element not found: ${selector}`);
    return element;
}

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(canvas);
