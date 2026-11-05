import { describe, expect, it } from 'vitest';
import { guestSignature } from '../guestSignature';

// #471 (FEAT-109, decision #471 point 64): "Marie (invité)", else "Invité"; nothing for a member.
const t = (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key);

describe('guestSignature', () => {
  it('signs with the guest\'s name, "Invité" without one, nothing for a member', () => {
    expect(guestSignature('Marie', t)).toBe('shares.guest.signature.named:{"name":"Marie"}');
    expect(guestSignature('  ', t)).toBe('shares.guest.signature.anonymous');
    expect(guestSignature(null, t)).toBeNull();
    expect(guestSignature(undefined, t)).toBeNull();
  });
});
