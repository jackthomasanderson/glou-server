import fs from 'fs';
import path from 'path';

// ISSUE_169: read at runtime (not a compile-time `import … from '../package.json'`)
// so this file never pulls package.json into the TypeScript program's rootDir
// computation — that would shift the whole `dist/` output under `dist/src/`
// and break the Docker image's `node dist/index.js` entrypoint.
function readVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export const APP_VERSION = readVersion();
