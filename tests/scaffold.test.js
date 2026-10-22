const { existsSync, readFileSync } = require('fs');
const assert = require('assert');

assert.ok(existsSync('package.json'), 'package.json exists');
assert.ok(existsSync('vite.config.ts'), 'vite.config.ts exists');
assert.ok(existsSync('tsconfig.json'), 'tsconfig.json exists');
assert.ok(existsSync('scripts/package-zip.js'), 'scripts/package-zip.js exists');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.ok(pkg.scripts.build, 'package.json has build script');
assert.ok(pkg.scripts.dev, 'package.json has dev script');
assert.ok(pkg.scripts.package, 'package.json has package script');
assert.ok(pkg.scripts.test, 'package.json has test script');
assert.ok(pkg.scripts.typecheck, 'package.json has typecheck script');
assert.ok(pkg.packageManager?.startsWith('pnpm'), 'packageManager is pnpm');

const viteConfig = readFileSync('vite.config.ts', 'utf8');
assert.ok(
  viteConfig.includes('upgrade to @crxjs only if'),
  'vite.config.ts contains @crxjs upgrade comment',
);
assert.ok(viteConfig.includes('emptyOutDir'), 'vite.config.ts sets emptyOutDir');
assert.ok(viteConfig.includes('outDir'), 'vite.config.ts sets outDir');

const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
assert.equal(tsconfig.compilerOptions.allowJs, true, 'tsconfig allowJs true');
assert.equal(tsconfig.compilerOptions.strict, false, 'tsconfig strict false');
assert.equal(tsconfig.compilerOptions.target, 'ES2022', 'tsconfig target ES2022');
assert.equal(tsconfig.compilerOptions.module, 'ESNext', 'tsconfig module ESNext');
assert.equal(tsconfig.compilerOptions.resolveJsonModule, true, 'tsconfig resolveJsonModule true');
assert.equal(tsconfig.compilerOptions.isolatedModules, true, 'tsconfig isolatedModules true');

console.log('scaffold verifier PASS');
