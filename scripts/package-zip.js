const { readFileSync, existsSync, mkdirSync } = require('fs');
const { execSync } = require('child_process');

const manifestPath = existsSync('src/manifest.json') ? 'src/manifest.json' : 'manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '0.0.0';

if (!existsSync('dist/manifest.json')) {
  console.error('dist/ not built — run pnpm build first');
  process.exit(1);
}

mkdirSync('release', { recursive: true });
const zipName = `release/tab-organizer-${version}.zip`;

try {
  execSync(`zip -r "${zipName}" dist -x "*.DS_Store"`, { stdio: 'inherit' });
  console.log(`Created ${zipName}`);
} catch {
  // fallback: no zip binary, just report
  console.log(`Would create ${zipName} from dist/ (zip not available)`);
}
