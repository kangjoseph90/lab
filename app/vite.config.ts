import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
    resolve: {
        alias: {
            '@lab/math': fileURLToPath(new URL('../packages/math/src/index.ts', import.meta.url)),
        },
    },
});
