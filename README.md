# Lab

Personal web lab for math visualizations, calculators, and small interactive projects.

## Structure

- `app`: Vite + TypeScript vanilla web app.
- `packages/math`: Shared math package for expression AST parsing, evaluation, and differentiation.
- `packages/fractal`: Mandelbrot and Julia iteration routines.
- `packages/precision`: Double-double arithmetic for fractal navigation and rendering.

## Graph rendering

Add multiple equations with **+ 식 추가**. Each row has its own color picker,
visibility eye icon, and delete button. Press Enter to apply an edit immediately,
or pause typing for automatic updates. An invalid equation displays an error on
its row and is omitted while the remaining equations continue to render.
Deleting every equation leaves one empty input and a blank coordinate grid.

CPU renders the visible equations in one worker, blending each curve or inequality
fill in list order. GPU generates one compute pipeline for the visible equations
and composites them in one dispatch/readback. Colors are uniform data, so changing
colors does not recompile the shader. The grid is drawn once over the combined
result. Hidden or invalid expressions do not consume per-pixel render work.

Graph mode has a Backend selector, like Fractal mode. GPU uses WebGPU compute
shaders generated from the equation and its symbolic derivatives. CPU uses the
existing Web Worker renderer. Both draw implicit equalities, inequalities, and
real-valued complex expressions, with Newton refinement and nearby-zero interval
checks for curve coverage.

GPU is selected initially when the browser exposes WebGPU; otherwise CPU is
selected. GPU requires an available WebGPU adapter. Shader/device errors are
shown beside the selector; switch to CPU to continue. GPU uses f32 arithmetic,
so CPU is preferable for deep zooms, extreme constants, or numerically sensitive
equations. Equations are compiled once and the GPU pipeline is reused while
panning and zooming. The graph grid is drawn with Canvas 2D in both modes.

Graph mode also includes 22 recommended equations in the collapsible **추천 수식**
section. Its native selector groups x/y and complex-z examples by category.
Choose a preset to apply its equation to the active row and fit its view; Reset view
returns to that preset's framing. Manual edits update the selection indicator.
The catalog includes standard conics, polynomial hearts, periodic patterns,
complex level curves, the exact Mandelbrot main cardioid and period-2 disk, and
their union. The three-iteration escape region is explicitly a finite-iteration
approximation, not the full Mandelbrot set. For complex Mandelbrot presets,
the graph variable z represents the parameter c. See
[the attracting fixed-point and period-2 derivation](https://www.ibiblio.org/e-notes/MSet/attractor.htm).

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```
