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

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'src/_dummy.js',
      output: {
        entryFileNames: '_dummy.js',
        assetFileNames: '_dummy.[ext]',
      },
    },
  },
  plugins: [
    {
      name: 'static-copy',
      closeBundle() {
        // shortcut: plain copy preserves service_worker path at dist root, upgrade to @crxjs only if background HMR needed

        if (existsSync('src/manifest.json')) {
          mkdirSync('dist', { recursive: true });
          copyFileSync('src/manifest.json', 'dist/manifest.json');
        }

        if (existsSync('src/background.js')) {
          mkdirSync('dist', { recursive: true });
          copyFileSync('src/background.js', 'dist/background.js');
        } else if (existsSync('src/background/index.js')) {
          mkdirSync('dist', { recursive: true });
          copyFileSync('src/background/index.js', 'dist/background.js');
        } else if (existsSync('src/background/index.ts')) {
          mkdirSync('dist', { recursive: true });
          copyFileSync('src/background/index.ts', 'dist/background.js');
        } else if (existsSync('src/background')) {
          const stat = statSync('src/background');
          if (!stat.isDirectory()) {
            mkdirSync('dist', { recursive: true });
            copyFileSync('src/background', 'dist/background.js');
          }
        }

        if (existsSync('src/newtab')) {
          copyDir('src/newtab', 'dist/newtab');
        }

        if (existsSync('public/icons')) {
          copyDir('public/icons', 'dist/icons');
        } else if (existsSync('icons')) {
          copyDir('icons', 'dist/icons');
        }

        // clean vite dummy output
        for (const f of ['dist/_dummy.js', 'dist/_dummy.css']) {
          if (existsSync(f)) unlinkSync(f);
        }
      },
    },
  ],
});
