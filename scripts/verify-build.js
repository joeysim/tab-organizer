import { readFileSync, existsSync } from 'fs';

const distPath = 'dist/background.js';
if (!existsSync(distPath)) {
  console.error(`verify-build: missing ${distPath}`);
  process.exit(1);
}

const content = readFileSync(distPath, 'utf8');

if (!content.includes('function extractPageContent')) {
  console.error('verify-build: dist/background.js missing function extractPageContent');
  process.exit(1);
}

if (/^import.*extract/m.test(content)) {
  console.error('verify-build: dist/background.js contains import leak for extract');
  process.exit(1);
}

console.log('verify-build: PASS — dist/background.js contains extractPageContent without import leak');
