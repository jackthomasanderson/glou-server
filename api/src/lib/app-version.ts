import fs from 'fs';
import path from 'path';

function readVersion(): string {
  try {
    // ISSUE_169 / #466: read at runtime (a compile-time import of package.json
    // would pull it into the TypeScript program). Resolved from the working
    // directory — the package root however the API runs (Docker WORKDIR /app,
    // `npm run dev`, vitest), like uploads/ and backups/. Not from __dirname:
    // the compiled file sits at dist/api/src/lib/, the source at src/lib/.
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export const APP_VERSION = readVersion();
