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
      input: {
        background: 'src/background/index.ts',
        newtab: 'src/newtab/index.html',
      },
    },
  },
  plugins: [{
    name: 'static-copy',
    closeBundle() {
      // shortcut: plain copy preserves service_worker path at dist root, upgrade to @crxjs only if background HMR needed
      if (existsSync('src/manifest.json')) { ensureDist(); copyFileSync('src/manifest.json', 'dist/manifest.json'); }
      // vite html entry src/newtab/index.html emits to dist/src/newtab/index.html — move to canonical dist/newtab/index.html
      if (existsSync('dist/src/newtab/index.html')) {
        try { mkdirSync('dist/newtab', { recursive: true }); copyFileSync('dist/src/newtab/index.html', 'dist/newtab/index.html'); } catch {}
      }
      // legacy fallback
      if (existsSync('src/newtab/newtab.html') && !existsSync('dist/newtab/newtab.html')) {
        try { ensureDist(); mkdirSync('dist/newtab', { recursive: true }); copyFileSync('src/newtab/newtab.html', 'dist/newtab/newtab.html'); } catch {}
      }
      if (existsSync('public/icons')) copyDir('public/icons', 'dist/icons');
      else if (existsSync('icons')) copyDir('icons', 'dist/icons');
      // normalize background output from rollup (assets/background-*.js + background-*.js) to background.js at root per manifest
      for (const f of readdirSync('dist').filter(f => f.startsWith('background') && f.endsWith('.js'))) {
        try { unlinkSync(join('dist', f)); } catch {}
      }
      const bgBuilt = readdirSync('dist/assets').find(f => f.startsWith('background') && f.endsWith('.js'));
      if (bgBuilt) { copyFileSync(join('dist/assets', bgBuilt), 'dist/background.js'); }
    },
  }],
});
