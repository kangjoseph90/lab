/** Wait for both the preview and input idle time before starting the expensive render. */
export class RenderRefinement {
    #version = 0;
    #timer: ReturnType<typeof setTimeout> | undefined;
    #settle: (() => void) | undefined;

    cancel(): void {
        this.#version++;
        clearTimeout(this.#timer);
        this.#timer = undefined;
        this.#settle?.();
        this.#settle = undefined;
    }

    run<T>(render: (refined: boolean) => Promise<T>, preview: boolean): Promise<T | void> {
        this.cancel();
        if (!preview) return render(true);
        const version = this.#version;
        return new Promise((resolve, reject) => {
            this.#settle = () => resolve();
            let ready = false;
            let idle = false;
            const fail = (cause: unknown) => {
                if (version === this.#version) {
                    clearTimeout(this.#timer);
                    this.#timer = undefined;
                    this.#settle = undefined;
                }
                reject(cause);
            };
            const finish = () => {
                if (!ready || !idle || version !== this.#version) return;
                void Promise.resolve()
                    .then(() => (version === this.#version ? render(true) : undefined))
                    .then((value) => {
                        if (version === this.#version) this.#settle = undefined;
                        resolve(value);
                    }, fail);
            };
            this.#timer = setTimeout(() => {
                this.#timer = undefined;
                idle = true;
                finish();
            }, 150);
            void Promise.resolve()
                .then(() => (version === this.#version ? render(false) : undefined))
                .then(() => {
                    ready = true;
                    finish();
                }, fail);
        });
    }
}
