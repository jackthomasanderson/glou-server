'use client';
import { useState } from 'react';
import type { AdminReauth } from '@/lib/config/client';
import { isStepUpRefusal, type useAdminStepUp } from '@/components/admin/AdminStepUpDialog';
import { notifyError } from '@/lib/toast';
import { configErrorKey } from './shared';

type Save = (reauth?: AdminReauth) => Promise<void>;

/**
 * #893: saves a card whose change asks for the step-up only in one direction
 * (shorter retention, backups off, sign-up opened: shared/admin-config.ts).
 * `submit(needsStepUp, message, save)` opens the step-up dialog first when
 * the change needs it, and also when the server asks for it anyway (the
 * stored value changed since the page was loaded). `save` sends the change
 * and handles its success; its failures are said here.
 */
export function useGuardedSave(stepUp: ReturnType<typeof useAdminStepUp>) {
  const [saving, setSaving] = useState(false);

  const attempt = async (message: string, save: Save, reauth?: AdminReauth): Promise<void> => {
    setSaving(true);
    try {
      await save(reauth);
    } catch (err) {
      // Said inside the dialog, which stays open.
      if (reauth && isStepUpRefusal(err)) throw err;
      if (!reauth && err instanceof Error && err.message === 'REAUTH_REQUIRED') {
        stepUp.ask(message, (r) => attempt(message, save, r));
        return;
      }
      notifyError(configErrorKey(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = (needsStepUp: boolean, message: string, save: Save) => {
    if (needsStepUp) stepUp.ask(message, (reauth) => attempt(message, save, reauth));
    else void attempt(message, save);
  };

  return { submit, saving };
}
