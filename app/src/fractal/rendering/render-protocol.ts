import type { RenderOptions } from './renderer';
import type { Viewport } from '../../graph/viewport';

export type FractalRenderWorkerRequest =
    | { type: 'cancel'; id: number }
    | {
          type: 'render';
          id: number;
          width: number;
          height: number;
          viewport: Viewport;
          options: RenderOptions;
      };

export type FractalRenderWorkerResponse =
    | { type: 'chunk'; id: number; y: number; width: number; height: number; pixels: ArrayBuffer }
    | { type: 'complete'; id: number }
    | { type: 'error'; id: number; message: string };
