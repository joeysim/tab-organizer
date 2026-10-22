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
  const buildNum = Math.floor(Date.now() / 1000) % 60000; // fits 0-65535, changes each build
  const parts = baseVersion.split('.').map(Number);
  // ensure 4 parts max: e.g. 2.4.2 -> 2.4.2.<buildNum>
  manifest.version = [...parts.slice(0, 3), buildNum].join('.');
  manifest.version_name = `${baseVersion}-dev.${hash}${isDirty ? '-dirty' : ''}`;
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`version: ${manifest.version} (${manifest.version_name})`);
