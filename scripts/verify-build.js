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

const fieldsToCheck = ['manifest_version', 'name', 'version', 'permissions', 'host_permissions', 'background', 'action', 'icons'];
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

// 3. dist/newtab/index.html exists
const newtabPath = 'dist/newtab/index.html';
if (!existsSync(newtabPath)) fail(`missing ${newtabPath}`);
const newtabContent = readFileSync(newtabPath, 'utf8');
if (!newtabContent.includes('<html')) fail('dist/newtab/index.html does not look like HTML');
ok('dist/newtab/index.html exists');

ok('PASS — all build checks passed');
