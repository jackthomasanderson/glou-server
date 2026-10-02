'use client';

import React from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeMode } from '@/hooks/useThemeMode';

interface ThemeToggleProps {
  /** Tooltip side — the collapsed sidebar needs it on the right. */
  placement?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

/**
 * Light/dark switch required by ux-ui.md §3.1 (sidebar footer). It is a real
 * focusable button: the accessible name states the action, `aria-pressed`
 * exposes the dark state, and a polite live region announces the new mode.
 */
export function ThemeToggle({ placement = 'right', className = '' }: ThemeToggleProps) {
  const { t } = useTranslation();
  const { isDark, isResolved, toggleMode } = useThemeMode();

  const actionLabel = isDark ? t('theme.switchToLight') : t('theme.switchToDark');
  const stateLabel = isDark ? t('theme.activeDark') : t('theme.activeLight');

  return (
    <>
      <Tooltip content={actionLabel} placement={placement} delay={500}>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color="default"
          radius="md"
          onPress={toggleMode}
          aria-label={actionLabel}
          aria-pressed={isDark}
          className={`flex-shrink-0 ${className}`}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
      </Tooltip>
      <span role="status" aria-live="polite" className="sr-only">
        {isResolved ? stateLabel : ''}
      </span>
    </>
  );
}
