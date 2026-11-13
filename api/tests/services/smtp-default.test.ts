import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// #763: Prisma is mocked in unit tests, so the database default of a fresh
// configuration is pinned in the schema itself: STARTTLS is what port 587
// expects; TLS would be implicit TLS (port 465).
// #924: the boolean became a three-way mode (TLS, STARTTLS, NONE).
describe('SystemConfig SMTP default (#763, #924)', () => {
  const prismaDir = join(__dirname, '../../prisma');

  it('starts a fresh configuration with STARTTLS', () => {
    const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
    expect(schema).toMatch(/^\s*smtpSecurity\s+SmtpSecurity\s+@default\(STARTTLS\)/m);
    expect(schema).toMatch(/enum SmtpSecurity \{\s*TLS\s+STARTTLS\s+NONE\s*\}/);
    expect(schema).not.toMatch(/^\s*smtpSecure\s/m);
  });

  it('keeps each instance\'s choice: secure = true becomes TLS, false becomes STARTTLS', () => {
    const dir = readdirSync(join(prismaDir, 'migrations')).find((d) => d.endsWith('_smtp_security_mode'));
    expect(dir).toBeDefined();
    const sql = readFileSync(join(prismaDir, 'migrations', dir as string, 'migration.sql'), 'utf8');
    expect(sql).toMatch(/WHEN "smtpSecure" THEN 'TLS'/);
    expect(sql).toMatch(/ELSE 'STARTTLS'/);
    // The old column goes only after the copy.
    expect(sql.indexOf('DROP COLUMN "smtpSecure"')).toBeGreaterThan(sql.indexOf('UPDATE "SystemConfig"'));
  });
});
