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

  // A backup code is 20 hex chars (crypto.randomBytes(10)); the schemas used
  // to cap at 8-10 and rejected every backup code.
  const BACKUP_CODE = 'a1b2c3d4e5f60718293a';

  it('turnOff2faSchema allows an optional TOTP or backup code alongside the password', () => {
    expect(turnOff2faSchema.safeParse({ password: 'x' }).success).toBe(true);
    expect(turnOff2faSchema.safeParse({ password: 'x', code: '123456' }).success).toBe(true);
    expect(turnOff2faSchema.safeParse({ password: 'x', code: BACKUP_CODE }).success).toBe(true);
    expect(turnOff2faSchema.safeParse({ password: 'x', code: `${BACKUP_CODE}0` }).success).toBe(false);
  });

  it('verify2faSchema accepts a TOTP or a backup code and defaults trustDevice to false', () => {
    const res = verify2faSchema.safeParse({ code: '123456' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.trustDevice).toBe(false);
    expect(verify2faSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verify2faSchema.safeParse({ code: BACKUP_CODE }).success).toBe(true);
    expect(verify2faSchema.safeParse({ code: `${BACKUP_CODE}0` }).success).toBe(false);
  });
});

describe('password minimum length', () => {
  it('is enforced identically on sign-up and password change', async () => {
    const { updatePasswordSchema } = await import('../../src/schemas/user.schema');
    const { PASSWORD_MIN_LENGTH } = await import('../../src/schemas/password');
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(updatePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'wine1234' }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'a'.repeat(12) }).success).toBe(true);
  });
});
