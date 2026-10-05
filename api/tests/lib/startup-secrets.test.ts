import { describe, it, expect } from 'vitest';
import {
  findSecretProblems,
  describeSecretProblem,
  PLACEHOLDER_JWT_SECRET,
  PLACEHOLDER_CONFIG_ENCRYPTION_KEY,
} from '../../src/lib/startup-secrets';

const GOOD_KEY = 'a1'.repeat(32);

describe('findSecretProblems', () => {
  it('accepts real secrets', () => {
    expect(findSecretProblems({ JWT_SECRET: 'x'.repeat(48), CONFIG_ENCRYPTION_KEY: GOOD_KEY })).toEqual([]);
  });

  it('flags unset and empty variables (compose passes an unset var as "")', () => {
    expect(findSecretProblems({ JWT_SECRET: '', CONFIG_ENCRYPTION_KEY: GOOD_KEY })).toEqual([
      { name: 'JWT_SECRET', reason: 'missing' },
    ]);
    expect(findSecretProblems({})).toEqual([
      { name: 'JWT_SECRET', reason: 'missing' },
      { name: 'CONFIG_ENCRYPTION_KEY', reason: 'missing' },
    ]);
  });

  it('flags the .env.example placeholders', () => {
    expect(
      findSecretProblems({ JWT_SECRET: PLACEHOLDER_JWT_SECRET, CONFIG_ENCRYPTION_KEY: PLACEHOLDER_CONFIG_ENCRYPTION_KEY }),
    ).toEqual([
      { name: 'JWT_SECRET', reason: 'placeholder' },
      { name: 'CONFIG_ENCRYPTION_KEY', reason: 'placeholder' },
    ]);
  });

  it('flags an encryption key that is not 64 hex characters', () => {
    expect(findSecretProblems({ JWT_SECRET: 'x'.repeat(48), CONFIG_ENCRYPTION_KEY: 'not-hex' })).toEqual([
      { name: 'CONFIG_ENCRYPTION_KEY', reason: 'invalid' },
    ]);
  });
});

describe('describeSecretProblem', () => {
  it('names the variable and how to fix it', () => {
    const msg = describeSecretProblem({ name: 'JWT_SECRET', reason: 'missing' });
    expect(msg).toContain('JWT_SECRET');
    expect(msg).toContain('openssl rand');
  });
});
