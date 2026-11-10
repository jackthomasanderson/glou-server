'use client';
import React, { useState } from 'react';
import { Button, Switch } from '@heroui/react';
import { UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, type SystemConfigPublic } from '@/lib/config/client';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ConfigCard, configErrorKey, useConfigForm, useConfigSaved } from '../shared';

const toForm = (cfg: SystemConfigPublic) => ({ registrationOpen: cfg.registrationOpen });

/** #73, #757: who can create an account on the instance, under its own heading. */
export function RegistrationCard({ config }: { config: SystemConfigPublic }) {
  const { t } = useTranslation();
  const { form, update, reset } = useConfigForm(toForm(config));
  const [saving, setSaving] = useState(false);
  const onSaved = useConfigSaved();

  const save = async () => {
    setSaving(true);
    try {
      const updated = await configClient.updateRegistration(form);
      onSaved(updated);
      reset(toForm(updated));
      notifySuccess('adminConfig.registration.saved');
    } catch (err) {
      notifyError(configErrorKey(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfigCard id="config-registration" icon={UserPlus} title={t('adminConfig.registration.title')} description={t('adminConfig.registration.description')}>
      <Switch isSelected={form.registrationOpen} onValueChange={(v) => update({ registrationOpen: v })} size="sm">
        {t('adminConfig.registration.enabled')}
      </Switch>
      <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={save} className="self-start">
        {t('adminConfig.save')}
      </Button>
    </ConfigCard>
  );
}
