import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  turnOn2faSchema,
  turnOff2faSchema,
  verify2faSchema,
} from '../../src/schemas/auth.schema';

describe('registerSchema', () => {
  const valid = {
    username: 'jack_thomas',
    email: 'jack@example.com',
    password: 'correct-horse-battery-staple',
    displayName: 'Jack',
  };

  it('accepts a well-formed payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an empty-string displayName and an omitted displayName', () => {
    expect(registerSchema.safeParse({ ...valid, displayName: '' }).success).toBe(true);
    const { displayName: _omit, ...noDisplay } = valid;
    expect(registerSchema.safeParse(noDisplay).success).toBe(true);
  });

  it('rejects a username shorter than 3 or longer than 30 chars', () => {
    expect(registerSchema.safeParse({ ...valid, username: 'ab' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, username: 'a'.repeat(31) }).success).toBe(false);
  });

  it('rejects usernames with characters outside [a-zA-Z0-9_-]', () => {
    for (const bad of ['jack thomas', 'jack.thomas', 'jack@t', 'éléonore']) {
      expect(registerSchema.safeParse({ ...valid, username: bad }).success).toBe(false);
    }
  });

  it('rejects an invalid email', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('enforces the 12..128 password length window', () => {
    expect(registerSchema.safeParse({ ...valid, password: 'a'.repeat(11) }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: 'a'.repeat(12) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, password: 'a'.repeat(129) }).success).toBe(false);
  });

  it('surfaces stable machine-readable error codes', () => {
    const res = registerSchema.safeParse({ ...valid, username: 'ab' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toBe('USERNAME_TOO_SHORT');
    }
  });
});

describe('loginSchema', () => {
  it('defaults rememberMe to false when omitted', () => {
    const res = loginSchema.safeParse({ identifier: 'jack', password: 'x' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.rememberMe).toBe(false);
  });

  it('rejects an empty identifier or password', () => {
    expect(loginSchema.safeParse({ identifier: '', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: 'jack', password: '' }).success).toBe(false);
  });
});

describe('2FA schemas', () => {
  it('turnOn2faSchema requires exactly a 6-char code', () => {
    expect(turnOn2faSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(turnOn2faSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(turnOn2faSchema.safeParse({ code: '1234567' }).success).toBe(false);
  });

  it('turnOff2faSchema allows an optional 6..8 char code alongside the password', () => {
    expect(turnOff2faSchema.safeParse({ password: 'x' }).success).toBe(true);
    expect(turnOff2faSchema.safeParse({ password: 'x', code: '123456' }).success).toBe(true);
    expect(turnOff2faSchema.safeParse({ password: 'x', code: '12345678' }).success).toBe(true);
    expect(turnOff2faSchema.safeParse({ password: 'x', code: '123456789' }).success).toBe(false);
  });

  it('verify2faSchema accepts a 6..10 char code and defaults trustDevice to false', () => {
    const res = verify2faSchema.safeParse({ code: '123456' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.trustDevice).toBe(false);
    expect(verify2faSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verify2faSchema.safeParse({ code: '12345678901' }).success).toBe(false);
  });
});
