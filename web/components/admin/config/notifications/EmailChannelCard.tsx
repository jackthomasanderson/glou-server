'use client';
import React, { useState } from 'react';
import { Button, Input, Switch, SelectItem } from '@heroui/react';
import { Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, type AdminReauth, type SystemConfigPublic } from '@/lib/config/client';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ChannelStatus, ConfigCard, SaveBar, TestUsesSavedHint, configErrorKey, isKnownConfigError, useConfigForm, useConfigSaved, type ChannelState } from '../shared';

const toForm = (cfg: SystemConfigPublic) => ({
  smtpEnabled: cfg.smtpEnabled,
  smtpHost: cfg.smtpHost ?? '',
  smtpPort: String(cfg.smtpPort ?? 587),
  smtpUser: cfg.smtpUser ?? '',
  smtpPass: '',
  smtpFrom: cfg.smtpFrom ?? '',
  smtpSecure: cfg.smtpSecure,
});

const STARTTLS_PORT = '587';
const TLS_PORT = '465';

/**
 * #763: nodemailer's `secure: true` is TLS from the first byte (port 465);
 * `false` starts in clear and upgrades with STARTTLS (port 587). Picking a
 * mode moves the port only while it is empty or still the other mode's
 * default, so a custom port is never overwritten.
 */
export function portForSecurity(port: string, secure: boolean): string {
  const otherDefault = secure ? STARTTLS_PORT : TLS_PORT;
  return port === '' || port === otherDefault ? (secure ? TLS_PORT : STARTTLS_PORT) : port;
}

function emailState(cfg: SystemConfigPublic): ChannelState {
  if (!cfg.smtpHost) return 'notConfigured';
  return cfg.smtpEnabled ? 'active' : 'configuredOff';
}

/**
 * The email channel: the SMTP server that sends notifications and password
 * reset links. #758: its only on/off switch, its settings and its tests.
 */
export function EmailChannelCard({ config }: { config: SystemConfigPublic }) {
  const { t } = useTranslation();
  const { form, update, reset, isDirty } = useConfigForm(toForm(config));
  const [testEmail, setTestEmail] = useState('');
  const [saving, setSaving] = useState(false);
  // #759: each test says its own progress, and only one runs at a time.
  const [testing, setTesting] = useState<'connection' | 'email' | null>(null);
  const onSaved = useConfigSaved();
  // #890: the mail server sends reset links and security alerts.
  const stepUp = useAdminStepUp();

  const save = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      const updated = await configClient.updateSmtp({
        smtpEnabled: form.smtpEnabled,
        smtpHost: form.smtpHost || null,
        smtpPort: form.smtpPort ? parseInt(form.smtpPort, 10) : null,
        smtpUser: form.smtpUser || null,
        smtpPass: form.smtpPass || undefined,
        smtpFrom: form.smtpFrom || null,
        smtpSecure: form.smtpSecure,
      }, reauth);
      onSaved(updated);
      reset(toForm(updated));
      notifySuccess('adminConfig.smtp.saved');
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      notifyError(configErrorKey(err));
    } finally {
      setSaving(false);
    }
  };

  const test = async (withEmail: boolean, reauth: AdminReauth) => {
    setTesting(withEmail ? 'email' : 'connection');
    try {
      const result = await configClient.testSmtp(withEmail ? testEmail || undefined : undefined, reauth);
      if (result.success) notifySuccess(withEmail ? 'adminConfig.smtp.testEmailSuccess' : 'adminConfig.smtp.testSuccess');
      // SMTP_NOT_CONFIGURED is said in words; a mail server's own refusal is shown as it came.
      else if (isKnownConfigError(result.error)) notifyError(`adminConfig.errors.${result.error}`);
      else notifyError('adminConfig.smtp.testError', { error: result.error ?? '' });
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      notifyError(configErrorKey(err));
    } finally {
      setTesting(null);
    }
  };

  return (
    <ConfigCard id="config-email" icon={Mail} title={t('adminConfig.cards.email')} description={t('adminConfig.notifPolicy.emailHint')} status={<ChannelStatus state={emailState(config)} />} isDirty={isDirty}>
      <Switch isSelected={form.smtpEnabled} onValueChange={(v) => update({ smtpEnabled: v })} size="sm">
        {t('adminConfig.smtp.enabled')}
      </Switch>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label={t('adminConfig.smtp.host')} placeholder={t('adminConfig.smtp.hostPlaceholder')} value={form.smtpHost} onValueChange={(v) => update({ smtpHost: v })} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
        <Input label={t('adminConfig.smtp.port')} type="number" value={form.smtpPort} onValueChange={(v) => update({ smtpPort: v })} variant="bordered" size="sm" radius="md" labelPlacement="outside" />
        <Input label={t('adminConfig.smtp.user')} placeholder={t('adminConfig.smtp.userPlaceholder')} value={form.smtpUser} onValueChange={(v) => update({ smtpUser: v })} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="off" />
        <Input label={t('adminConfig.smtp.pass')} type="password" placeholder={config.smtpPassMasked ?? t('adminConfig.smtp.passPlaceholder')} value={form.smtpPass} onValueChange={(v) => update({ smtpPass: v })} variant="bordered" size="sm" radius="md" labelPlacement="outside" autoComplete="new-password" />
        <Input label={t('adminConfig.smtp.from')} placeholder={t('adminConfig.smtp.fromPlaceholder')} value={form.smtpFrom} onValueChange={(v) => update({ smtpFrom: v })} variant="bordered" size="sm" radius="md" labelPlacement="outside" className="sm:col-span-2" />
      </div>
      <SingleSelect
        label={t('adminConfig.smtp.secure')}
        description={t('adminConfig.smtp.secureHint')}
        selectedKeys={[form.smtpSecure ? 'tls' : 'starttls']}
        onSelectionChange={(keys) => {
          const value = Array.from(keys)[0];
          if (value !== 'tls' && value !== 'starttls') return;
          const secure = value === 'tls';
          update({ smtpSecure: secure, smtpPort: portForSecurity(form.smtpPort, secure) });
        }}
        variant="bordered" size="sm" radius="md" labelPlacement="outside"
      >
        <SelectItem key="starttls">{t('adminConfig.smtp.secureStarttls')}</SelectItem>
        <SelectItem key="tls">{t('adminConfig.smtp.secureTls')}</SelectItem>
      </SingleSelect>
      <SaveBar isDirty={isDirty} isSaving={saving} onSave={() => stepUp.ask(t('adminConfig.stepUp.smtp'), save)}>
        <Button size="sm" variant="bordered" isLoading={testing === 'connection'} isDisabled={isDirty || testing !== null} onPress={() => stepUp.ask(t('adminConfig.stepUp.smtpTest'), (reauth) => test(false, reauth))}>{t('adminConfig.smtp.test')}</Button>
      </SaveBar>
      <TestUsesSavedHint show={isDirty} />
      <div className="flex items-end gap-2 pt-1 border-t border-divider">
        <Input label={t('adminConfig.smtp.testRecipient')} placeholder={t('adminConfig.smtp.testRecipientPlaceholder')} type="email" value={testEmail} onValueChange={setTestEmail} variant="bordered" size="sm" radius="md" labelPlacement="outside" className="flex-1" />
        <Button size="sm" variant="flat" isLoading={testing === 'email'} onPress={() => stepUp.ask(t('adminConfig.stepUp.smtpTest'), (reauth) => test(true, reauth))} isDisabled={!testEmail || isDirty || testing !== null}>{t('adminConfig.smtp.sendTest')}</Button>
      </div>
      {stepUp.dialog}
    </ConfigCard>
  );
}
