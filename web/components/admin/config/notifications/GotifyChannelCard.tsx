'use client';
import React, { useState } from 'react';
import { Button, Input, Switch } from '@heroui/react';
import { Webhook } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, type AdminReauth, type SystemConfigPublic } from '@/lib/config/client';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ChannelStatus, ConfigCard, TestUsesSavedHint, configErrorKey, isKnownConfigError, useConfigForm, useConfigSaved, type ChannelState } from '../shared';

const toForm = (cfg: SystemConfigPublic) => ({ gotifyEnabled: cfg.gotifyEnabled, gotifyUrl: cfg.gotifyUrl ?? '', gotifyToken: '' });

function gotifyState(cfg: SystemConfigPublic): ChannelState {
  if (!cfg.gotifyUrl) return 'notConfigured';
  return cfg.gotifyEnabled ? 'active' : 'configuredOff';
}

/**
 * The Gotify channel: the instance's Gotify server. #758: its only on/off
 * switch, saved with its URL and token, and its test.
 */
export function GotifyChannelCard({ config }: { config: SystemConfigPublic }) {
  const { t } = useTranslation();
  const { form, update, reset, isDirty } = useConfigForm(toForm(config));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const onSaved = useConfigSaved();
  // #890: the Gotify server receives the security alerts.
  const stepUp = useAdminStepUp();

  const save = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      const updated = await configClient.updateGotify({
        gotifyEnabled: form.gotifyEnabled,
        gotifyUrl: form.gotifyUrl || null,
        gotifyToken: form.gotifyToken || undefined,
      }, reauth);
      onSaved(updated);
      reset(toForm(updated));
      notifySuccess('adminConfig.gotify.saved');
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      notifyError(configErrorKey(err));
    } finally {
      setSaving(false);
    }
  };

  const test = async (reauth: AdminReauth) => {
    setTesting(true);
    try {
      const result = await configClient.testGotify(reauth);
      if (result.success) notifySuccess('adminConfig.gotify.testSuccess');
      else notifyError(isKnownConfigError(result.error) ? `adminConfig.errors.${result.error}` : 'adminConfig.errors.UNEXPECTED_ERROR');
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      notifyError(configErrorKey(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <ConfigCard id="config-gotify" icon={Webhook} title={t('adminConfig.cards.gotify')} description={t('adminConfig.notifPolicy.webhookHint')} status={<ChannelStatus state={gotifyState(config)} />}>
      <Switch isSelected={form.gotifyEnabled} onValueChange={(v) => update({ gotifyEnabled: v })} size="sm">
        {t('adminConfig.gotify.enabled')}
      </Switch>
      <Input label={t('adminConfig.gotify.url')} placeholder={t('adminConfig.gotify.urlPlaceholder')} value={form.gotifyUrl} onValueChange={(v) => update({ gotifyUrl: v })} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
      <Input label={t('adminConfig.gotify.token')} type="password" placeholder={config.gotifyTokenMasked ?? t('adminConfig.gotify.tokenPlaceholder')} value={form.gotifyToken} onValueChange={(v) => update({ gotifyToken: v })} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
      <div className="flex gap-2">
        <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={() => stepUp.ask(t('adminConfig.stepUp.gotify'), save)}>{t('adminConfig.gotify.save')}</Button>
        <Button size="sm" variant="bordered" isLoading={testing} isDisabled={isDirty} onPress={() => stepUp.ask(t('adminConfig.stepUp.gotifyTest'), test)}>{t('adminConfig.gotify.test')}</Button>
      </div>
      <TestUsesSavedHint show={isDirty} />
      {stepUp.dialog}
    </ConfigCard>
  );
}
