import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const baseVersion = pkg.version; // e.g. "2.4.2"
let hash = 'unknown';
try { hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch {}
const isRelease = process.argv.includes('--release') || process.env.BUILD_ENV === 'release';
const isDirty = (() => { try { return execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0; } catch { return false; }})();

// Chrome `version` must be 1-4 dot ints (0-65535). For dev, append build number.
const manifestPath = 'dist/manifest.json';
let manifest;
try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8')); }

if (isRelease) {
  manifest.version = baseVersion;
  manifest.version_name = baseVersion;
} else {
  // dev: version stays semver-compatible but unique per build (Chrome needs bump to reload)
  // use base + .0 + hash build count approximated by timestamp mod 65535
  // monotonic build number: commit count (never wraps backwards)
  let buildNum = 1;
  try { buildNum = parseInt(execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim(), 10) % 60000 || 1; } catch { buildNum = Math.floor(Date.now() / 1000) % 60000; }
  const parts = baseVersion.split('.').map(Number);
  manifest.version = [...parts.slice(0, 3), buildNum].join('.');
  manifest.version_name = `${baseVersion}-dev.${hash}${isDirty ? '-dirty' : ''}`;
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`version: ${manifest.version} (${manifest.version_name})`);
