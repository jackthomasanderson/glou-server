import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #466: shared/ is compiled into the API (tsc, CommonJS) and bundled into the
// web app (webpack/Turbopack, browser). It imports nothing but its own files,
// reads no environment and declares no TS enum (isolatedModules on the web).
const SHARED_DIR = path.resolve(__dirname, '../../../shared');
const files = fs
  .readdirSync(SHARED_DIR, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.ts'));

const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

describe('shared/ contracts folder (#466)', () => {
  it('holds the contract files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s imports only from shared/', (file) => {
    const code = withoutComments(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
    const specifiers = [...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*(?:\(\s*)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/g)]
      .map((m) => m[1] ?? m[2] ?? m[3]);
    for (const specifier of specifiers) expect(specifier).toMatch(/^\.\//);
    expect(code).not.toMatch(/\bprocess\.env\b/);
    expect(code).not.toMatch(/\benum\s+\w+\s*\{/);
  });
});
