import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { render, screen } from '@testing-library/react';
import { computeStrength, PasswordStrengthMeter } from '../PasswordStrengthMeter';

// i18n: echo the key back so assertions can target stable strings.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('computeStrength', () => {
  it('is empty for an empty password', () => {
    expect(computeStrength('')).toEqual({ score: 0, hints: [] });
  });

  it('rewards a password that satisfies every rule with the top score and no hints', () => {
    const res = computeStrength('Abcdefghijk1!');
    expect(res.score).toBe(3);
    expect(res.hints).toEqual([]);
  });

  it('lists exactly the unmet rules as hints', () => {
    // 8 lowercase letters: fails length, uppercase, numbers, special
    expect(computeStrength('abcdefgh').hints.sort()).toEqual(['length', 'numbers', 'special', 'uppercase']);
  });

  it('always returns a score in 0..3 and hints ⊆ the 4 rule keys', () => {
    const RULES = ['length', 'uppercase', 'numbers', 'special'];
    fc.assert(
      fc.property(fc.string(), (pwd) => {
        const { score, hints } = computeStrength(pwd);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(3);
        expect(hints.every((h) => RULES.includes(h))).toBe(true);
        expect(new Set(hints).size).toBe(hints.length); // no duplicates
      }),
    );
  });
});

describe('<PasswordStrengthMeter />', () => {
  it('renders nothing when the password is empty', () => {
    const { container } = render(<PasswordStrengthMeter password="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the "weak" label and remaining-rule hints for a poor password', () => {
    render(<PasswordStrengthMeter password="abcdefgh" />);
    expect(screen.getByText('auth.passwordStrength.weak')).toBeInTheDocument();
    expect(screen.getByText(/auth\.passwordStrength\.hint\.length/)).toBeInTheDocument();
  });

  it('shows the "strong" label and no hints for a strong password', () => {
    render(<PasswordStrengthMeter password="Abcdefghijk1!" />);
    expect(screen.getByText('auth.passwordStrength.strong')).toBeInTheDocument();
    expect(screen.queryByText(/passwordStrength\.hint\./)).not.toBeInTheDocument();
  });
});
