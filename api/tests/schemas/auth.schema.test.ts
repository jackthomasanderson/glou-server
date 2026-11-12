import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  turnOn2faSchema,
  turnOff2faSchema,
  verify2faSchema,
} from '../../src/schemas/auth.schema';
import { updateProfileSchema, UPLOADED_AVATAR_PATH } from '../../src/schemas/user.schema';

describe('registerSchema', () => {
  const valid = {
    username: 'jack_thomas',
    email: 'jack@example.com',
    password: 'correct-horse-battery-staple',
    displayName: 'Jack',
  };

  it('accepts a well-formed payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
    // #529: optional sign-up language, FR or EN only.
    expect(registerSchema.safeParse({ ...valid, language: 'EN' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, language: 'DE' }).success).toBe(false);
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
  it('turnOn2faSchema requires the password and exactly a 6-char code (#603)', () => {
    expect(turnOn2faSchema.safeParse({ password: 'pw', code: '123456' }).success).toBe(true);
    expect(turnOn2faSchema.safeParse({ code: '123456' }).success).toBe(false);
    expect(turnOn2faSchema.safeParse({ password: '', code: '123456' }).success).toBe(false);
    expect(turnOn2faSchema.safeParse({ password: 'pw', code: '12345' }).success).toBe(false);
    expect(turnOn2faSchema.safeParse({ password: 'pw', code: '1234567' }).success).toBe(false);
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
    const { PASSWORD_MIN_LENGTH } = await import('../../../shared/auth');
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(updatePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'wine1234' }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'a'.repeat(12) }).success).toBe(true);
  });
});

// #880: only the avatar routes set `avatarUrl`; the profile form no longer
// sends it, and a value sent anyway is dropped, never stored.
describe('updateProfileSchema avatarUrl', () => {
  it('drops any avatarUrl and keeps the name fields', () => {
    for (const avatarUrl of ['/uploads/avatars/3f2b1c9e-0a4d-4c1b-9e7f-2d6a8b5c4e10.jpg', 'https://example.com/me.png', '', null]) {
      const parsed = updateProfileSchema.safeParse({ avatarUrl, displayName: 'Jack' });
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ displayName: 'Jack' });
    }
  });
});

// #668 / #880: the only shape the upload route stores, the one a file may be deleted for.
describe('UPLOADED_AVATAR_PATH', () => {
  it('matches an uploaded avatar, and the names older uploads kept (client extension in any case, or none)', () => {
    for (const avatarUrl of [
      '/uploads/avatars/3f2b1c9e-0a4d-4c1b-9e7f-2d6a8b5c4e10.jpg',
      '/uploads/avatars/3f2b1c9e-0a4d-4c1b-9e7f-2d6a8b5c4e10-1722700000000.JPG',
      '/uploads/avatars/3f2b1c9e-0a4d-4c1b-9e7f-2d6a8b5c4e10-1722700000000',
    ]) {
      expect(UPLOADED_AVATAR_PATH.exec(avatarUrl)?.[1]).toBe(avatarUrl.slice('/uploads/avatars/'.length));
    }
  });

  it('matches nothing else', () => {
    for (const avatarUrl of ['/uploads/products/x.jpg', '/uploads/avatars/../scans/x.jpg', '/uploads/avatars/', 'me.png', 'https://example.com/uploads/avatars/x.png']) {
      expect(UPLOADED_AVATAR_PATH.test(avatarUrl)).toBe(false);
    }
  });
});
