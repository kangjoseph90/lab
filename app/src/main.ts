import './styles.css';
import { FractalRenderer } from './fractal/rendering/renderer';
import {
    fractalScreenToWorldNumber,
    fractalViewportToNumber,
    fractalViewport,
    panFractalViewport,
    scaleFractalViewportUnits,
    zoomAtFractal,
} from './fractal/viewport';
import type { FractalViewport } from './fractal/viewport';
import { ExpressionList } from './graph/expression-list';
import { GRAPH_PRESETS, presetViewport } from './graph/presets';
import type { GraphPreset } from './graph/presets';
import { GraphRenderer } from './graph/rendering/renderer';
import { DEFAULT_VIEWPORT, zoomAt } from './graph/viewport';
import type { Point, Viewport } from './graph/viewport';

type Mode = 'graph' | 'fractal';

const FRACTAL_VIEWPORT = fractalViewport(-0.5, 0, 0.005);

const JULIA_VIEWPORT = fractalViewport(0, 0, 0.005);

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
        <div class="expression-heading">
          <span>Equations</span>
          <button type="button" id="add-expression">+ 식 추가</button>
        </div>
        <div class="expression-list" id="expression-list"></div>
      </form>
      <section class="graph-panel" id="graph-panel">
        <div class="field">
          <label for="graph-backend">Backend</label>
          <select id="graph-backend" name="graph-backend">
            <option value="gpu">GPU</option>
            <option value="cpu">CPU</option>
          </select>
        </div>
        <p class="backend-error" id="graph-render-error" role="alert"></p>
      </section>
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
        <label class="check-field" for="fractal-perturbation">
          <input id="fractal-perturbation" name="fractal-perturbation" type="checkbox" />
          <span>Perturbation</span>
        </label>
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
        <p class="backend-error" id="fractal-render-error" role="alert"></p>
      </section>
      <details class="graph-presets" id="graph-presets">
        <summary id="presets-title">추천 수식</summary>
        <div class="preset-controls">
          <div class="field">
            <label for="preset-select">Example</label>
            <select id="preset-select" name="preset-select"></select>
          </div>
          <p class="preset-description" id="preset-description" aria-live="polite"></p>
        </div>
      </details>
      <div class="sidebar-note" id="sidebar-note"></div>
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
const graphPanel = requireElement<HTMLElement>('#graph-panel');
const graphBackendInput = requireElement<HTMLSelectElement>('#graph-backend');
const graphRenderError = requireElement<HTMLElement>('#graph-render-error');
const fractalRenderError = requireElement<HTMLElement>('#fractal-render-error');
const graphPresets = requireElement<HTMLElement>('#graph-presets');
const presetSelect = requireElement<HTMLSelectElement>('#preset-select');
const presetDescription = requireElement<HTMLElement>('#preset-description');
if (!navigator.gpu) graphBackendInput.value = 'cpu';
const fractalPanel = requireElement<HTMLElement>('#fractal-panel');
const graphModeButton = requireElement<HTMLButtonElement>('#mode-graph');
const fractalModeButton = requireElement<HTMLButtonElement>('#mode-fractal');
const fractalTypeInput = requireElement<HTMLSelectElement>('#fractal-type');
const fractalPrecisionInput = requireElement<HTMLSelectElement>('#fractal-precision');
const fractalBackendInput = requireElement<HTMLSelectElement>('#fractal-backend');
const fractalPerturbationInput = requireElement<HTMLInputElement>('#fractal-perturbation');
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
let graphViewport: Viewport = { ...DEFAULT_VIEWPORT };
let fractalCurrentViewport: FractalViewport = scaleFractalViewportUnits(FRACTAL_VIEWPORT, 1);
let dragStart:
    | { point: Point; mode: 'graph'; viewport: Viewport }
    | { point: Point; mode: 'fractal'; viewport: FractalViewport }
    | undefined;
let canvasScale = 1;
let renderRequest = 0;
let selectedPreset: GraphPreset | undefined = GRAPH_PRESETS.find(
    (preset) => preset.id === 'circle',
);
const expressionList = new ExpressionList(requireElement<HTMLElement>('#expression-list'), {
    onChange: () => {
        graphRenderer.setLayers(expressionList.layers);
        if (activeMode === 'graph') scheduleRender();
    },
    onActiveChange: syncPresetSelection,
});
graphRenderer.setLayers(expressionList.layers);
requireElement<HTMLButtonElement>('#add-expression').addEventListener('click', () =>
    expressionList.add(),
);

function renderPresetList(): void {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '추천 수식 선택';
    presetSelect.replaceChildren(placeholder);
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const preset of GRAPH_PRESETS) {
        const label = `${preset.domain === 'real' ? 'x · y' : '복소수 z'} · ${preset.group}`;
        let group = groups.get(label);
        if (!group) {
            group = document.createElement('optgroup');
            group.label = label;
            groups.set(label, group);
            presetSelect.append(group);
        }
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        group.append(option);
    }
    syncPresetSelection();
}

function syncPresetSelection(): void {
    const expression = expressionList.activeInput.value.replace(/\s/g, '');
    selectedPreset = GRAPH_PRESETS.find(
        (preset) => preset.expression.replace(/\s/g, '') === expression,
    );
    presetSelect.value = selectedPreset?.id ?? '';
    presetDescription.textContent = selectedPreset?.description ?? '';
}

presetSelect.addEventListener('change', () => {
    const preset = GRAPH_PRESETS.find((entry) => entry.id === presetSelect.value);
    if (!preset) return;
    selectedPreset = preset;
    dragStart = undefined;
    graphViewport = presetViewport(preset, { x: canvas.width, y: canvas.height });
    expressionList.apply(preset.expression);
});

function resizeCanvas(): void {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio, 1.5);
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    if (activeMode === 'graph') {
        graphViewport = {
            ...graphViewport,
            unitsPerPixel: graphViewport.unitsPerPixel * (canvasScale / scale),
        };
    } else {
        fractalCurrentViewport = scaleFractalViewportUnits(
            fractalCurrentViewport,
            canvasScale / scale,
        );
    }
    canvasScale = scale;
    scheduleRender();
}

function scheduleRender(): void {
    const request = ++renderRequest;
    graphRenderError.textContent = '';
    fractalRenderError.textContent = '';
    rendering.classList.add('is-visible');
    const render =
        activeMode === 'graph'
            ? graphRenderer.render(graphViewport, {
                  lineWidth: 1.35,
                  color: [19, 105, 196],
                  backend: readGraphBackend(),
              })
            : fractalRenderer.render(fractalCurrentViewport, {
                  fractal: readFractalConfig(),
                  maxIterations: readMaxIterations(),
                  precision: readFractalPrecision(),
                  backend: readFractalBackend(),
                  perturbation: readFractalPerturbation(),
              });

    void render
        .catch((cause: unknown) => {
            if (request !== renderRequest) return;
            if (activeMode === 'graph') {
                graphRenderError.textContent =
                    cause instanceof Error ? cause.message : String(cause);
            } else {
                showError(cause);
            }
        })
        .finally(() => {
            if (request === renderRequest) rendering.classList.remove('is-visible');
        });
}

function updateEquation(): void {
    if (activeMode !== 'graph') return;
    expressionList.updateActive();
}

function showError(cause: unknown): void {
    fractalRenderError.textContent = cause instanceof Error ? cause.message : String(cause);
}

function clearError(): void {
    fractalRenderError.textContent = '';
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
    updateEquation();
});

canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    dragStart =
        activeMode === 'graph'
            ? { point: canvasPoint(event), mode: 'graph', viewport: { ...graphViewport } }
            : {
                  point: canvasPoint(event),
                  mode: 'fractal',
                  viewport: fractalCurrentViewport,
              };
    currentRenderer().beginPan();
    canvas.classList.add('is-dragging');
});

canvas.addEventListener('pointermove', (event) => {
    const point = canvasPoint(event);
    const world =
        activeMode === 'graph'
            ? {
                  x:
                      graphViewport.centerX +
                      (point.x - canvas.width / 2) * graphViewport.unitsPerPixel,
                  y:
                      graphViewport.centerY -
                      (point.y - canvas.height / 2) * graphViewport.unitsPerPixel,
              }
            : fractalScreenToWorldNumber(
                  point,
                  { x: canvas.width, y: canvas.height },
                  fractalCurrentViewport,
              );
    coordinates.textContent = `x ${formatCoordinate(world.x)} / y ${formatCoordinate(world.y)} / scale ${formatScale(currentUnitsPerPixel())}`;

    if (!dragStart) return;
    if (dragStart.mode === 'graph') {
        graphViewport = {
            ...dragStart.viewport,
            centerX:
                dragStart.viewport.centerX -
                (point.x - dragStart.point.x) * dragStart.viewport.unitsPerPixel,
            centerY:
                dragStart.viewport.centerY +
                (point.y - dragStart.point.y) * dragStart.viewport.unitsPerPixel,
        };
    } else {
        fractalCurrentViewport = panFractalViewport(
            dragStart.viewport,
            point.x - dragStart.point.x,
            point.y - dragStart.point.y,
        );
    }
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
        const factor = Math.exp(event.deltaY * 0.001);
        if (activeMode === 'graph') {
            graphViewport = zoomAt(
                graphViewport,
                canvasPoint(event),
                {
                    x: canvas.width,
                    y: canvas.height,
                },
                factor,
            );
        } else {
            fractalCurrentViewport = zoomAtFractal(
                fractalCurrentViewport,
                canvasPoint(event),
                { x: canvas.width, y: canvas.height },
                factor,
            );
        }
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
graphBackendInput.addEventListener('change', () => {
    updateFractalControls();
    if (activeMode === 'graph') scheduleRender();
});
fractalModeButton.addEventListener('click', () => setMode('fractal'));
fractalTypeInput.addEventListener('change', () => {
    updateFractalControls();
    if (activeMode === 'fractal') {
        resetViewport();
        scheduleRender();
    }
});
[fractalPrecisionInput, fractalBackendInput, fractalPerturbationInput].forEach((control) => {
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
    if (activeMode === 'graph') {
        graphViewport = zoomAt(
            graphViewport,
            { x: canvas.width / 2, y: canvas.height / 2 },
            { x: canvas.width, y: canvas.height },
            factor,
        );
    } else {
        fractalCurrentViewport = zoomAtFractal(
            fractalCurrentViewport,
            { x: canvas.width / 2, y: canvas.height / 2 },
            { x: canvas.width, y: canvas.height },
            factor,
        );
    }
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
    graphPanel.classList.toggle('is-hidden', activeMode !== 'graph');
    graphPresets.classList.toggle('is-hidden', activeMode !== 'graph');
    fractalPanel.classList.toggle('is-hidden', activeMode !== 'fractal');
    projectTitle.textContent = activeMode === 'graph' ? 'Graph Lab' : 'Fractal Lab';
    updateFractalControls();
    sidebarNote.textContent =
        activeMode === 'graph' ? '' : 'Drag to pan. Scroll or use controls to zoom.';
    clearError();
    scheduleRender();
}

function currentRenderer(): Pick<GraphRenderer, 'beginPan' | 'cancel' | 'previewPan'> {
    return activeMode === 'graph' ? graphRenderer : fractalRenderer;
}

function currentUnitsPerPixel(): number {
    return activeMode === 'graph'
        ? graphViewport.unitsPerPixel
        : fractalViewportToNumber(fractalCurrentViewport).unitsPerPixel;
}

function formatCoordinate(value: number): string {
    return Math.abs(value) >= 1000 || (value !== 0 && Math.abs(value) < 0.01)
        ? value.toExponential(2)
        : value.toFixed(2);
}

function formatScale(value: number): string {
    return value.toExponential(2);
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

function readGraphBackend() {
    return graphBackendInput.value === 'cpu' ? 'cpu' : 'gpu';
}

function readFractalPerturbation() {
    return fractalPerturbationInput.checked;
}

function readNumber(inputElement: HTMLInputElement, fallback: number): number {
    const value = Number.parseFloat(inputElement.value);
    return Number.isFinite(value) ? value : fallback;
}

function currentFractalViewport(): FractalViewport {
    return fractalTypeInput.value === 'julia' ? JULIA_VIEWPORT : FRACTAL_VIEWPORT;
}

function resetViewport(): void {
    if (activeMode === 'graph') {
        graphViewport = selectedPreset
            ? presetViewport(selectedPreset, { x: canvas.width, y: canvas.height })
            : { ...DEFAULT_VIEWPORT, unitsPerPixel: DEFAULT_VIEWPORT.unitsPerPixel / canvasScale };
    } else {
        fractalCurrentViewport = scaleFractalViewportUnits(
            currentFractalViewport(),
            1 / canvasScale,
        );
    }
}

function updateFractalControls(): void {
    const isJulia = fractalTypeInput.value === 'julia';
    const cRe = readNumber(juliaRealInput, -0.8);
    const cIm = readNumber(juliaImagInput, 0.156);

    const precision = readFractalPrecision();
    const precisionLabel = precision === 'double-double' ? 'double-double' : 'number';
    const backend = readFractalBackend();
    const backendLabel = backend === 'gpu' ? 'GPU' : 'CPU';
    const canPerturb = backend === 'gpu';
    const perturbationLabel = canPerturb && readFractalPerturbation() ? ', perturbation' : '';

    juliaFields.classList.toggle('is-hidden', !isJulia);
    fractalPerturbationInput.disabled = !canPerturb;
    if (!canPerturb) fractalPerturbationInput.checked = false;
    fractalName.textContent = isJulia
        ? `Julia set, c = ${cRe.toFixed(3)} + ${cIm.toFixed(3)}i, ${precisionLabel}, ${backendLabel}${perturbationLabel}`
        : `Mandelbrot set, ${precisionLabel}, ${backendLabel}${perturbationLabel}`;
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
renderPresetList();
updateFractalControls();
resizeObserver.observe(canvas);
