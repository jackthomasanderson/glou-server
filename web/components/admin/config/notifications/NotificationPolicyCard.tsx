'use client';
import React, { useState } from 'react';
import { Button, Switch } from '@heroui/react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, type AdminReauth, type SystemConfigPublic } from '@/lib/config/client';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ConfigCard, configErrorKey, useConfigForm, useConfigSaved } from '../shared';

const toForm = (cfg: SystemConfigPublic) => ({ smtpEnabled: cfg.smtpEnabled, gotifyEnabled: cfg.gotifyEnabled, inAppEnabled: cfg.inAppEnabled });

/** The instance-wide switch of each notification channel. */
export function NotificationPolicyCard({ config }: { config: SystemConfigPublic }) {
  const { t } = useTranslation();
  const { form, update, reset } = useConfigForm(toForm(config));
  const [saving, setSaving] = useState(false);
  const onSaved = useConfigSaved();
  const stepUp = useAdminStepUp();

  const save = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      const updated = await configClient.updateNotifPolicy(form, reauth);
      onSaved(updated);
      reset(toForm(updated));
      notifySuccess('adminConfig.notifPolicy.saved');
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      notifyError(configErrorKey(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfigCard id="config-notif-policy" icon={Bell} title={t('adminConfig.cards.policy')} description={t('adminConfig.notifPolicy.description')}>
      <div className="flex flex-col gap-3">
        {([
          { key: 'inAppEnabled', label: t('adminConfig.notifPolicy.inApp'), hint: t('adminConfig.notifPolicy.inAppHint') },
          { key: 'smtpEnabled', label: t('adminConfig.notifPolicy.email'), hint: t('adminConfig.notifPolicy.emailHint') },
          { key: 'gotifyEnabled', label: t('adminConfig.notifPolicy.webhook'), hint: t('adminConfig.notifPolicy.webhookHint') },
        ] as const).map(({ key, label, hint }) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-foreground-400">{hint}</p>
            </div>
            <Switch isSelected={form[key]} onValueChange={(v) => update({ [key]: v })} size="sm" className="shrink-0 mt-0.5" />
          </div>
        ))}
      </div>
      <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={() => stepUp.ask(t('adminConfig.stepUp.notifications'), save)} className="self-start">{t('adminConfig.notifPolicy.save')}</Button>
      {stepUp.dialog}
    </ConfigCard>
  );
}
