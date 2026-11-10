import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// #763: Prisma is mocked in unit tests, so the database default of a fresh
// configuration is pinned in the schema itself: STARTTLS (secure = false) is
// what port 587 expects; `true` would be implicit TLS (port 465).
describe('SystemConfig SMTP default (#763)', () => {
  it('starts a fresh configuration with smtpSecure false', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    expect(schema).toMatch(/^\s*smtpSecure\s+Boolean\s+@default\(false\)/m);
  });
});
