'use client';
import React from 'react';
import { Switch } from '@heroui/react';
import { UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { opensRegistration } from '@shared/admin-config';
import { configClient, type AdminReauth, type SystemConfigPublic } from '@/lib/config/client';
import { useAdminStepUp } from '@/components/admin/AdminStepUpDialog';
import { notifySuccess } from '@/lib/toast';
import { ConfigCard, SaveBar, useConfigForm, useConfigSaved } from '../shared';
import { useGuardedSave } from '../useGuardedSave';

const toForm = (cfg: SystemConfigPublic) => ({ registrationOpen: cfg.registrationOpen });

/** #73, #757: who can create an account on the instance, under its own heading. */
export function RegistrationCard({ config }: { config: SystemConfigPublic }) {
  const { t } = useTranslation();
  const { form, update, reset, isDirty } = useConfigForm(toForm(config));
  const onSaved = useConfigSaved();
  // #893: opening sign-up lets anyone in, so it is confirmed; closing it is not.
  const stepUp = useAdminStepUp();
  const { submit, saving } = useGuardedSave(stepUp);

  const save = () => {
    const values = { registrationOpen: form.registrationOpen };
    submit(opensRegistration(config, values), t('adminConfig.stepUp.registration'), async (reauth?: AdminReauth) => {
      const updated = await configClient.updateRegistration(values, reauth);
      onSaved(updated);
      reset(toForm(updated));
      notifySuccess('adminConfig.registration.saved');
    });
  };

  return (
    <ConfigCard id="config-registration" icon={UserPlus} title={t('adminConfig.registration.title')} description={t('adminConfig.registration.description')} isDirty={isDirty}>
      <Switch isSelected={form.registrationOpen} onValueChange={(v) => update({ registrationOpen: v })} size="sm">
        {t('adminConfig.registration.enabled')}
      </Switch>
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={save} />
      {stepUp.dialog}
    </ConfigCard>
  );
}
