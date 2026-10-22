import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

// Bundle background as single file with inlined deps — no shared chunks
await build({
  entryPoints: ['src/background/index.ts'],
  bundle: true,
  outfile: 'dist/background.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: false,
});
console.log('built dist/background.js via esbuild');
