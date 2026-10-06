import { describe, it, expect } from 'vitest';
import robots from '../../app/robots';

describe('robots.txt (#209)', () => {
  it('disallows every crawler on every path, guest-share links included', () => {
    const { rules } = robots();
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list).toHaveLength(1);
    expect(list[0].userAgent).toBe('*');
    expect(list[0].disallow).toBe('/');
    expect(list[0].allow).toBeUndefined();
  });
});
