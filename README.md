# Lab

Personal web lab for math visualizations, calculators, and small interactive projects.

## Structure

- `app`: Vite + TypeScript vanilla web app.
- `packages/math`: Shared math package for expression AST parsing, evaluation, and differentiation.
- `packages/fractal`: Mandelbrot and Julia iteration routines.
- `packages/precision`: Double-double arithmetic for fractal navigation and rendering.

## Graph rendering

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

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```
