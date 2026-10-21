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
    lib: { entry: 'src/background/index.js', formats: ['es'], fileName: () => '_tmp.js' },
  },
  plugins: [{
    name: 'static-copy',
    closeBundle() {
      // shortcut: plain copy preserves service_worker path at dist root, upgrade to @crxjs only if background HMR needed
      if (existsSync('src/manifest.json')) { ensureDist(); copyFileSync('src/manifest.json', 'dist/manifest.json'); }
      if (existsSync('src/background/index.js')) { ensureDist(); copyFileSync('src/background/index.js', 'dist/background.js'); }
      if (existsSync('src/newtab')) copyDir('src/newtab', 'dist/newtab');
      if (existsSync('public/icons')) copyDir('public/icons', 'dist/icons');
      else if (existsSync('icons')) copyDir('icons', 'dist/icons');
      for (const f of ['dist/_tmp.js']) if (existsSync(f)) unlinkSync(f);
    },
  }],
});
