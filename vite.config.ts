import { defineConfig } from 'vite';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
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
        let html = readFileSync('dist/src/newtab/index.html', 'utf8');
        html = html.replaceAll('../../assets/', '../assets/');
        mkdirSync('dist/newtab', { recursive: true });
        writeFileSync('dist/newtab/index.html', html);
        writeFileSync('dist/newtab/newtab.html', html);
      }
      if (existsSync('public/icons')) copyDir('public/icons', 'dist/icons');
      else if (existsSync('icons')) copyDir('icons', 'dist/icons');
      // background.js is built separately via esbuild (see scripts/build-background.js) — no rollup handling needed
    },
  }],
});
