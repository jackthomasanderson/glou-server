'use client';
import React, { useState } from 'react';
import { Button, Switch } from '@heroui/react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, type AdminReauth, type SystemConfigPublic } from '@/lib/config/client';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ChannelStatus, ConfigCard, configErrorKey, useConfigForm, useConfigSaved } from '../shared';

const toForm = (cfg: SystemConfigPublic) => ({ inAppEnabled: cfg.inAppEnabled });

/** The in-app channel's switch (#758: each channel has its own card). */
export function InAppChannelCard({ config }: { config: SystemConfigPublic }) {
  const { t } = useTranslation();
  const { form, update, reset } = useConfigForm(toForm(config));
  const [saving, setSaving] = useState(false);
  const onSaved = useConfigSaved();
  // #890: the channels carry the security alerts sent to members.
  const stepUp = useAdminStepUp();

  const save = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      // The route takes the three switches: the other two are sent as saved,
      // never as another card shows them (#758).
      const updated = await configClient.updateNotifPolicy({
        inAppEnabled: form.inAppEnabled,
        smtpEnabled: config.smtpEnabled,
        gotifyEnabled: config.gotifyEnabled,
      }, reauth);
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
    >
      <Switch isSelected={form.inAppEnabled} onValueChange={(v) => update({ inAppEnabled: v })} size="sm">
        {t('adminConfig.notifPolicy.inApp')}
      </Switch>
      <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={() => stepUp.ask(t('adminConfig.stepUp.notifications'), save)} className="self-start">
        {t('adminConfig.notifPolicy.save')}
      </Button>
      {stepUp.dialog}
    </ConfigCard>
  );
}
