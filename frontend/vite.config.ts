import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * roslib's CommonJS entry (node_modules/roslib/src/RosLib.js) starts with:
 *   var ROSLIB = this.ROSLIB || { REVISION: '1.4.1' };
 * In the production build, @rollup/plugin-commonjs rewrites that top-level
 * `this` to the module's lazily-initialised exports variable, which is still
 * `undefined` at that point. The result throws
 *   Uncaught TypeError: Cannot read properties of undefined (reading 'ROSLIB')
 * at import time, so React never mounts and the page is blank (the original
 * crash showed `at Joe (...)`). Dev works because esbuild handles CJS `this`
 * differently. We patch the one offending line *before* the commonjs plugin
 * runs (enforce: 'pre') so `this.ROSLIB` becomes a safe global lookup that
 * falls through to the `|| { ... }` literal.
 */
function fixRoslibThis(): Plugin {
  return {
    name: 'fix-roslib-top-level-this',
    enforce: 'pre',
    transform(code) {
      if (code.includes('var ROSLIB = this.ROSLIB')) {
        return {
          code: code.replace(
            'var ROSLIB = this.ROSLIB ||',
            'var ROSLIB = (typeof globalThis !== "undefined" && globalThis.ROSLIB) ||',
          ),
          map: null,
        };
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:8000';

  return {
    plugins: [fixRoslibThis(), react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        // Proxying lets the app call /api/... from the same origin in dev,
        // avoiding CORS friction altogether. Production builds talk to
        // VITE_API_URL directly (CORS still configured server-side as backup).
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
  };
});
