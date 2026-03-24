import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Bundle all JS deps into main process output.
// externalizeDepsPlugin marks all package.json deps as external, but we need
// them bundled since the packaged app has no node_modules. This plugin runs
// after externalizeDepsPlugin and removes everything except electron + node builtins.
function bundleAllDepsPlugin(): Plugin {
  return {
    name: 'vite:bundle-all-deps',
    config(config) {
      const rollup = config.build?.rollupOptions;
      if (!rollup) return;
      const external = rollup.external;
      if (!Array.isArray(external)) return;
      rollup.external = external.filter((e) => {
        if (typeof e === 'string') return e === 'electron';
        if (e instanceof RegExp) return e.source.startsWith('^electron/');
        return true;
      });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), bundleAllDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    css: {
      postcss: './postcss.config.js',
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
        },
      },
    },
  },
});
