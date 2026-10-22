import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { APP_VERSION } from '../../src/lib/app-version';

describe('APP_VERSION (#466)', () => {
  it('is the version of the API package', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });
});
