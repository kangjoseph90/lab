import type { Equation } from '../equation';
import type { RenderOptions } from './renderer';
import type { Viewport } from '../viewport';
import type { GraphLayer } from './layers';

export type RenderWorkerRequest =
    | { type: 'set-equation'; equation: Equation }
    | { type: 'set-layers'; layers: readonly GraphLayer[] }
    | { type: 'cancel'; id: number }
    | {
          type: 'render';
          id: number;
          width: number;
          height: number;
          viewport: Viewport;
          options: RenderOptions;
      };

export type RenderWorkerResponse =
    | { type: 'chunk'; id: number; y: number; width: number; height: number; pixels: ArrayBuffer }
    | { type: 'complete'; id: number }
    | { type: 'error'; id: number; message: string };
