import { lazy } from 'react';

const RETRY_FLAG = 'vite:lazy-import-reloaded';

const isDynamicImportError = (error) => {
    const message = error?.message || '';
    return (
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Importing a module script failed') ||
        message.includes('error loading dynamically imported module') ||
        message.includes('Outdated Optimize Dep')
    );
};

/**
 * Wraps React.lazy() with retry logic for Vite dev-server stale chunk errors.
 * On the first chunk failure, reloads once so the browser picks up fresh module hashes.
 */
export const lazyWithRetry = (importFn, retries = 2, intervalMs = 500) =>
    lazy(() =>
        new Promise((resolve, reject) => {
            const attempt = (remaining) => {
                importFn()
                    .then((module) => {
                        sessionStorage.removeItem(RETRY_FLAG);
                        resolve(module);
                    })
                    .catch((error) => {
                        if (isDynamicImportError(error) && !sessionStorage.getItem(RETRY_FLAG)) {
                            sessionStorage.setItem(RETRY_FLAG, '1');
                            window.location.reload();
                            return;
                        }

                        sessionStorage.removeItem(RETRY_FLAG);

                        if (remaining <= 0) {
                            reject(error);
                            return;
                        }

                        setTimeout(() => attempt(remaining - 1), intervalMs);
                    });
            };

            attempt(retries);
        })
    );
