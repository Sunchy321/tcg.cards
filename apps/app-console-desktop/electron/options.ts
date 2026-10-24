import { randomBytes } from 'node:crypto';
import type { ElectronOptions as NuxtElectronOptions } from 'nuxt-electron';
import type { ElectronOptions } from 'vite-plugin-electron';

/** Lifecycle callbacks supplied by the community Electron build plugin. */
type BuildLifecycle = Parameters<NonNullable<ElectronOptions['onstart']>>[0];

// Keep the launch identity in the server and child environment, never in renderer assets.
export const developmentIdentity = randomBytes(32).toString('hex');
process.env.CONSOLE_DEV_IDENTITY = developmentIdentity;

const ready = new Set<'main' | 'preload'>();
let started = false;

/** Starts only after both build groups exist, then restarts main or reloads preload. */
function onBuilt(group: 'main' | 'preload', lifecycle: BuildLifecycle) {
  ready.add(group);
  if (ready.size !== 2) return;
  if (process.env.ELECTRON_STARTUP_PREVENT === '1') return;
  if (!started || group === 'main') {
    started = true;
    // Pass explicit arguments to retain Chromium's sandbox rather than plugin defaults.
    void lifecycle.startup(['.']);
  } else {
    lifecycle.reload();
  }
}

/** Nuxt-managed Electron entries; the renderer remains a sandboxed Nuxt SPA. */
export const electronOptions: NuxtElectronOptions = {
  // Existing secure app-protocol URLs do not need the module's file:// path rewrites.
  disableDefaultOptions: true,
  build:                 [
    {
      // Shared Nuxt tsconfig references may not exist during the first dev build.
      vite:    { esbuild: { tsconfigRaw: '{"compilerOptions":{"target":"ES2022"}}' } },
      entry:   { 'main': 'electron/main.ts', 'runtime': 'electron/runtime.ts', 'task-worker': 'electron/task-worker.ts' },
      onstart: lifecycle => onBuilt('main', lifecycle),
    },
    {
      vite:    { esbuild: { tsconfigRaw: '{"compilerOptions":{"target":"ES2022"}}' } },
      entry:   'electron/preload.ts',
      onstart: lifecycle => onBuilt('preload', lifecycle),
    },
  ],
};
