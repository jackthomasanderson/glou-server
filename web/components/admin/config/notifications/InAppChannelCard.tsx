'use client';
import React, { useState } from 'react';
import { Switch } from '@heroui/react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, type AdminReauth, type SystemConfigPublic } from '@/lib/config/client';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ChannelStatus, ConfigCard, SaveBar, configErrorKey, useConfigForm, useConfigSaved } from '../shared';

const toForm = (cfg: SystemConfigPublic) => ({ inAppEnabled: cfg.inAppEnabled });

/** The in-app channel's switch (#758: each channel has its own card). */
export function InAppChannelCard({ config }: { config: SystemConfigPublic }) {
  const { t } = useTranslation();
  const { form, update, reset, isDirty } = useConfigForm(toForm(config));
  const [saving, setSaving] = useState(false);
  const onSaved = useConfigSaved();
  // #890: the channels carry the security alerts sent to members.
  const stepUp = useAdminStepUp();

  const save = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      // Only this card's switch: a stale copy of another channel's switch
      // can never overwrite that card's save (#758).
      const updated = await configClient.updateNotifPolicy({ inAppEnabled: form.inAppEnabled }, reauth);
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
    <ConfigCard
      id="config-in-app"
      icon={Bell}
      title={t('adminConfig.cards.inApp')}
      description={t('adminConfig.notifPolicy.inAppHint')}
      status={<ChannelStatus state={config.inAppEnabled ? 'active' : 'off'} />}
      isDirty={isDirty}
    >
      <Switch isSelected={form.inAppEnabled} onValueChange={(v) => update({ inAppEnabled: v })} size="sm">
        {t('adminConfig.notifPolicy.inApp')}
      </Switch>
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={() => stepUp.ask(t('adminConfig.stepUp.notifications'), save)} />
      {stepUp.dialog}
    </ConfigCard>
  );
}
