'use client';
import { useCallback, useEffect, useRef } from 'react';
import { closeToast } from '@heroui/react';
import { notifyError } from '@/lib/toast';

/**
 * #657: a form's "fix these fields before saving" message. Like any error it
 * stays until closed (ux-ui.md 5.3), but it speaks about the form, so it is
 * the form's to take back: it closes as soon as `resolved` turns true (the
 * fields are valid, or the form is closed), when the form leaves the page,
 * and when a new one replaces it. A real server error keeps `notifyError`
 * and stays.
 */
export function useValidationNotice(resolved: boolean) {
  const keyRef = useRef<string | null>(null);
  const clear = useCallback(() => {
    if (keyRef.current) closeToast(keyRef.current);
    keyRef.current = null;
  }, []);
  const show = useCallback((messageKey: string, values?: Record<string, unknown>) => {
    clear();
    keyRef.current = notifyError(messageKey, values) ?? null;
  }, [clear]);
  useEffect(() => { if (resolved) clear(); }, [resolved, clear]);
  useEffect(() => clear, [clear]);
  return show;
}
