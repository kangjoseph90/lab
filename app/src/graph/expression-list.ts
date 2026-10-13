import { compileEquation } from './equation';
import type { Equation } from './equation';
import { hexToColor } from './rendering/layers';
import type { GraphLayer } from './rendering/layers';

const PALETTE = ['#1369c4', '#d64b4b', '#2c9760', '#9155bd', '#d98b24', '#249ca6'];
function readEquation(input: string): Equation {
    const { expr, relation } = compileEquation(input);
    return { expr, relation };
}
type ExpressionRow = {
    id: number;
    element: HTMLElement;
    input: HTMLInputElement;
    color: HTMLInputElement;
    visible: HTMLInputElement;
    error: HTMLElement;
    equation: Equation | undefined;
    timer: number | undefined;
};

export class ExpressionList {
    readonly #container: HTMLElement;
    readonly #onChange: () => void;
    readonly #onActiveChange: () => void;
    readonly #rows: ExpressionRow[] = [];
    #active!: ExpressionRow;
    #nextId = 1;
    #layers: readonly GraphLayer[] = [];

    constructor(
        container: HTMLElement,
        callbacks: { onChange: () => void; onActiveChange: () => void },
    ) {
        this.#container = container;
        this.#onChange = callbacks.onChange;
        this.#onActiveChange = callbacks.onActiveChange;
        this.#createRow('x^2 + y^2 = 4');
        this.#rebuildLayers();
    }

    get activeInput(): HTMLInputElement {
        return this.#active.input;
    }
    get layers(): readonly GraphLayer[] {
        return this.#layers;
    }

    add(): void {
        this.#createRow('');
        this.#onActiveChange();
        this.#active.input.focus();
    }

    apply(expression: string): void {
        this.#active.input.value = expression;
        this.updateActive();
    }

    updateActive(): void {
        this.#update(this.#active);
    }

    #activate(row: ExpressionRow): void {
        this.#active = row;
        for (const entry of this.#rows) entry.element.classList.toggle('is-active', entry === row);
        this.#onActiveChange();
    }

    #createRow(expression: string): void {
        const id = this.#nextId++;
        const element = document.createElement('div');
        element.className = 'expression-entry';
        element.dataset.expressionId = String(id);
        const field = document.createElement('div');
        field.className = 'expression-row';
        const color = document.createElement('input');
        color.type = 'color';
        color.className = 'graph-color';
        color.value = PALETTE[(id - 1) % PALETTE.length]!;
        color.setAttribute('aria-label', `식 ${id} 색상`);
        color.title = '색상 변경';
        const input = document.createElement('input');
        input.type = 'text';
        input.id = id === 1 ? 'expression' : `expression-${id}`;
        input.value = expression;
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.placeholder = '예: y = sin(x)';
        input.setAttribute('aria-label', `식 ${id}`);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove-expression';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `식 ${id} 삭제`);
        field.append(color, input);
        const label = document.createElement('label');
        label.className = 'expression-visibility';
        label.title = '그래프 표시 / 숨기기';
        const visible = document.createElement('input');
        visible.type = 'checkbox';
        visible.checked = true;
        visible.setAttribute('aria-label', `식 ${id} 표시`);
        label.append(visible);
        const eye = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        eye.setAttribute('viewBox', '0 0 24 24');
        eye.setAttribute('aria-hidden', 'true');
        eye.innerHTML =
            '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="visibility-slash" d="m3 3 18 18"/>';
        label.append(eye);
        field.append(label, remove);
        const error = document.createElement('p');
        error.className = 'error';
        error.id = id === 1 ? 'expression-error' : `expression-error-${id}`;
        error.setAttribute('role', 'alert');
        input.setAttribute('aria-describedby', error.id);
        element.append(field, error);
        const row: ExpressionRow = {
            id,
            element,
            input,
            color,
            visible,
            error,
            equation: undefined,
            timer: undefined,
        };
        if (expression) row.equation = readEquation(expression);
        this.#rows.push(row);
        this.#container.append(element);
        this.#active = row;
        for (const entry of this.#rows) entry.element.classList.toggle('is-active', entry === row);
        for (const control of [input, color, visible, remove]) {
            control.addEventListener('focus', () => this.#activate(row));
        }
        input.addEventListener('input', () => {
            this.#activate(row);
            window.clearTimeout(row.timer);
            row.timer = window.setTimeout(() => this.#update(row), 250);
        });
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            this.#update(row);
        });
        color.addEventListener('input', () => this.#publish());
        visible.addEventListener('change', () => {
            element.classList.toggle('is-muted', !visible.checked);
            this.#publish();
        });
        remove.addEventListener('click', () => {
            window.clearTimeout(row.timer);
            const index = this.#rows.indexOf(row);
            this.#rows.splice(index, 1);
            row.element.remove();
            if (!this.#rows.length) this.#createRow('');
            this.#activate(this.#rows[Math.min(index, this.#rows.length - 1)]!);
            this.#publish();
            this.#active.input.focus();
        });
    }

    #update(row: ExpressionRow): void {
        window.clearTimeout(row.timer);
        row.timer = undefined;
        try {
            row.equation = row.input.value.trim() ? readEquation(row.input.value) : undefined;
            row.error.textContent = '';
            row.input.removeAttribute('aria-invalid');
        } catch (cause) {
            row.equation = undefined;
            row.error.textContent = cause instanceof Error ? cause.message : String(cause);
            row.input.setAttribute('aria-invalid', 'true');
        }
        if (row === this.#active) this.#onActiveChange();
        this.#publish();
    }

    #rebuildLayers(): void {
        this.#layers = this.#rows.flatMap((row) =>
            row.visible.checked && row.equation
                ? [{ equation: row.equation, color: hexToColor(row.color.value) }]
                : [],
        );
    }

    #publish(): void {
        this.#rebuildLayers();
        this.#onChange();
    }
}
