import { readFileSync, existsSync } from 'fs';

function fail(msg) {
  console.error(`verify-build: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`verify-build: ${msg}`);
}

// 1. dist/manifest.json fields == src/manifest.json
const srcManifestPath = 'src/manifest.json';
const distManifestPath = 'dist/manifest.json';

if (!existsSync(srcManifestPath)) fail(`missing ${srcManifestPath}`);
if (!existsSync(distManifestPath)) fail(`missing ${distManifestPath} — run pnpm build first`);

const srcManifest = JSON.parse(readFileSync(srcManifestPath, 'utf8'));
const distManifest = JSON.parse(readFileSync(distManifestPath, 'utf8'));

const fieldsToCheck = ['manifest_version', 'name', 'permissions', 'host_permissions', 'background', 'action', 'icons'];
// version: dist may have dev suffix (2.4.2.<build> + version_name), src is base semver — allow prefix match
if (!distManifest.version.startsWith(srcManifest.version)) fail(`manifest version mismatch: src=${srcManifest.version} dist=${distManifest.version}`);
for (const field of fieldsToCheck) {
  const srcVal = JSON.stringify(srcManifest[field]);
  const distVal = JSON.stringify(distManifest[field]);
  if (srcVal !== distVal) {
    fail(`manifest field mismatch "${field}": src=${srcVal} dist=${distVal}`);
  }
}
ok(`manifest fields match (${srcManifest.name} v${srcManifest.version})`);

// 2. dist/background.js exists at root without import leak
const bgPath = 'dist/background.js';
if (!existsSync(bgPath)) fail(`missing ${bgPath}`);
const bgContent = readFileSync(bgPath, 'utf8');
if (!bgContent.includes('function extractPageContent')) fail('dist/background.js missing function extractPageContent');
if (!bgContent.includes('extractPageContent')) fail('dist/background.js missing extractPageContent identifier');
if (/^import\s+.*from\s+['"].*extract/m.test(bgContent)) fail('dist/background.js contains import leak for extract');
if (/^import\s+.*extract/m.test(bgContent)) fail('dist/background.js contains import leak for extract');
ok('dist/background.js exists at root with bundled extractPageContent and no import leak');

// 3. dist/newtab files exist (global constraint: newtab/newtab.html)
for (const p of ['dist/newtab/index.html', 'dist/newtab/newtab.html']) { if (!existsSync(p)) fail(`missing ${p}`); const c = readFileSync(p, 'utf8'); if (!c.includes('<html')) fail(`${p} does not look like HTML`); ok(`${p} exists`); }
// 4. dist/icons exist
for (const icon of ['dist/icons/icon16.png', 'dist/icons/icon48.png', 'dist/icons/icon128.png']) if (!existsSync(icon)) fail(`missing ${icon}`); ok('dist/icons/* exist');

ok('PASS — all build checks passed');
