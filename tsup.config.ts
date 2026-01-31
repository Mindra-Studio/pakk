import { defineConfig } from 'tsup';

export default defineConfig([
  // Main library entry
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    minify: false,
    external: ['vite', 'next', 'webpack', 'rollup', 'esbuild', '@parcel/core', 'zstd-napi'],
  },
  // Plugin entries
  {
    entry: {
      'plugins/vite': 'src/plugins/vite.ts',
      'plugins/next': 'src/plugins/next.ts',
      'plugins/webpack': 'src/plugins/webpack.ts',
      'plugins/rollup': 'src/plugins/rollup.ts',
      'plugins/esbuild': 'src/plugins/esbuild.ts',
      'plugins/parcel': 'src/plugins/parcel.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: false,
    external: ['vite', 'next', 'webpack', 'rollup', 'esbuild', '@parcel/core', 'zstd-napi'],
  },
  // CLI entry (separate to add shebang)
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: false,
    splitting: false,
    treeshake: true,
    minify: false,
    external: ['zstd-napi'],
    banner: {
      js: '#!/usr/bin/env node',
    },
    // Prevent clean to not delete other builds
    clean: false,
  },
]);
