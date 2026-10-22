import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

function copyDir(src: string, dest: string) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}
function ensureDist() { mkdirSync('dist', { recursive: true }); }

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: 'src/newtab/index.html',
    },
  },
  plugins: [{
    name: 'static-copy',
    closeBundle() {
      // shortcut: plain copy preserves service_worker path at dist root, upgrade to @crxjs only if background HMR needed
      if (existsSync('src/manifest.json')) { ensureDist(); copyFileSync('src/manifest.json', 'dist/manifest.json'); }
      // vite html entry src/newtab/index.html emits to dist/src/newtab/index.html — move to canonical dist/newtab/index.html and fix asset paths
      if (existsSync('dist/src/newtab/index.html')) {
        try {
          const { readFileSync, writeFileSync } = require('fs');
          let html = readFileSync('dist/src/newtab/index.html', 'utf8');
          // fix relative asset paths: from dist/src/newtab (depth 2) to dist/newtab (depth 1)
          html = html.replaceAll('../../assets/', '../assets/');
          mkdirSync('dist/newtab', { recursive: true });
          writeFileSync('dist/newtab/index.html', html);
        } catch {}
      }
      if (existsSync('src/newtab/newtab.html') && !existsSync('dist/newtab/newtab.html')) {
        try { mkdirSync('dist/newtab', { recursive: true }); copyFileSync('src/newtab/newtab.html', 'dist/newtab/newtab.html'); } catch {}
      }
      if (existsSync('public/icons')) copyDir('public/icons', 'dist/icons');
      else if (existsSync('icons')) copyDir('icons', 'dist/icons');
      // background.js is built separately via esbuild (see scripts/build-background.js) — no rollup handling needed
    },
  }],
});
