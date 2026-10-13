import type { FractalRenderWarning, RenderOptions } from './renderer';
import type { FractalViewport } from '../viewport';

export type FractalRenderWorkerRequest =
    | { type: 'cancel'; id: number }
    | {
          type: 'render';
          id: number;
          width: number;
          height: number;
          viewport: FractalViewport;
          options: RenderOptions;
      };

export type FractalRenderWorkerResponse =
    | { type: 'chunk'; id: number; y: number; width: number; height: number; pixels: ArrayBuffer }
    | { type: 'complete'; id: number; warning?: FractalRenderWarning }
    | { type: 'error'; id: number; message: string };
