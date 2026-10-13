# Lab

Personal web lab for math visualizations, calculators, and small interactive projects.

## Structure

- `app`: Vite + TypeScript vanilla web app.
- `packages/math`: Shared math package for expression AST parsing, evaluation, and differentiation.
- `packages/fractal`: Mandelbrot and Julia iteration routines.
- `packages/precision`: Double-double arithmetic for fractal navigation and rendering.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```
