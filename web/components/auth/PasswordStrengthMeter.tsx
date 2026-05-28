'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface StrengthResult {
  score: 0 | 1 | 2 | 3;
  hints: string[];
}

export function computeStrength(password: string): StrengthResult {
  if (!password) return { score: 0, hints: [] };

  const hints: string[] = [];
  let score = 0;

  if (password.length >= 12) score++;
  else hints.push('length');

  if (/[A-Z]/.test(password)) score++;
  else hints.push('uppercase');

  if (/[0-9]/.test(password)) score++;
  else hints.push('numbers');

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else hints.push('special');

  return { score: Math.max(0, score - 1) as 0 | 1 | 2 | 3, hints };
}

const COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E'] as const;
const LEVEL_KEYS = ['weak', 'fair', 'good', 'strong'] as const;

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const { t } = useTranslation();

  if (!password) return null;

  const { score, hints } = computeStrength(password);
  const color = COLORS[score];
  const labelKey = LEVEL_KEYS[score];

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      {/* Bar */}
      <div className="flex gap-1">
        {([0, 1, 2, 3] as const).map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ backgroundColor: i <= score ? color : 'rgba(128,128,128,0.15)' }}
          />
        ))}
      </div>
      {/* Label + hints */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.65rem] font-semibold" style={{ color }}>
          {t(`auth.passwordStrength.${labelKey}`)}
        </span>
        {hints.length > 0 && (
          <span className="text-[0.6rem] text-default-400 text-right leading-tight">
            {hints.map((h) => t(`auth.passwordStrength.hint.${h}`)).join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}
