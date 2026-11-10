'use client';
import React, { useState } from 'react';
import { Button, Input, Chip, SelectItem } from '@heroui/react';
import { Globe, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { configClient, type AdminReauth, type NetworkCheckResult, type SystemConfigPublic } from '@/lib/config/client';
import { useAdminStepUp, isStepUpRefusal } from '@/components/admin/AdminStepUpDialog';
import { SingleSelect } from '@/components/ui/SingleSelect';
import { notifyError, notifySuccess } from '@/lib/toast';
import { ConfigCard, configErrorKey, useConfigForm, useConfigSaved } from '../shared';

type AccessMode = 'direct' | 'proxy';
const toForm = (cfg: SystemConfigPublic) => ({
  publicUrl: cfg.publicUrl ?? '',
  accessMode: (cfg.accessMode === 'proxy' ? 'proxy' : 'direct') as AccessMode,
});

/** FEAT-54: the address members reach the instance at, and the check of that setting. */
export function PublicUrlCard({ config }: { config: SystemConfigPublic }) {
  const { t } = useTranslation();
  const { form, update, reset } = useConfigForm(toForm(config));
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<NetworkCheckResult | null>(null);
  const onSaved = useConfigSaved();
  // #890: password reset links are built from the public URL.
  const stepUp = useAdminStepUp();

  const save = async (reauth: AdminReauth) => {
    setSaving(true);
    try {
      const updated = await configClient.updateNetwork({
        publicUrl: form.publicUrl.trim() ? form.publicUrl.trim() : null,
        accessMode: form.accessMode,
      }, reauth);
      onSaved(updated);
      reset(toForm(updated));
      setCheckResult(null);
      notifySuccess('adminConfig.network.saved');
    } catch (err) {
      if (isStepUpRefusal(err)) throw err;
      notifyError(configErrorKey(err));
    } finally {
      setSaving(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      setCheckResult(await configClient.checkNetwork());
    } catch {
      setCheckResult({ ok: false, warnings: ['NETWORK_ERROR'] });
    } finally {
      setChecking(false);
    }
  };

  return (
    <ConfigCard id="config-public-url" icon={Globe} title={t('adminConfig.cards.publicUrl')} description={t('adminConfig.network.description')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label={t('adminConfig.network.publicUrl')}
          description={t('adminConfig.network.publicUrlHint')}
          placeholder={t('adminConfig.network.publicUrlPlaceholder')}
          value={form.publicUrl}
          onValueChange={(v) => update({ publicUrl: v })}
          variant="bordered" size="sm" radius="md" labelPlacement="outside"
        />
        <SingleSelect
          label={t('adminConfig.network.accessMode')}
          description={t('adminConfig.network.accessModeHint')}
          selectedKeys={[form.accessMode]}
          onSelectionChange={(keys) => {
            const value = Array.from(keys)[0];
            if (value === 'direct' || value === 'proxy') update({ accessMode: value });
          }}
          variant="bordered" size="sm" radius="md" labelPlacement="outside"
        >
          <SelectItem key="direct">{t('adminConfig.network.accessModeOptions.direct')}</SelectItem>
          <SelectItem key="proxy">{t('adminConfig.network.accessModeOptions.proxy')}</SelectItem>
        </SingleSelect>
      </div>
      <Button size="sm" color="primary" variant="solid" isLoading={saving} onPress={() => stepUp.ask(t('adminConfig.stepUp.network'), save)} className="self-start">
        {t('adminConfig.network.save')}
      </Button>

      <div className="pt-4 border-t border-divider flex flex-col gap-2">
        <p className="text-sm font-semibold">{t('adminConfig.network.summary.title')}</p>
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-foreground-500">{t('adminConfig.network.summary.effectiveUrl')}: </span>
            <span className="font-mono">{config.effectivePublicUrl}</span>
          </p>
          {!config.publicUrl && <p className="text-xs text-foreground-400">{t('adminConfig.network.summary.fromEnv')}</p>}
          <p>
            <span className="text-foreground-500">{t('adminConfig.network.summary.accessMode')}: </span>
            <Chip size="sm" variant="flat" radius="sm" color="primary">
              {t(`adminConfig.network.accessModeOptions.${config.accessMode === 'proxy' ? 'proxy' : 'direct'}`)}
            </Chip>
          </p>
        </div>
      </div>

      {/* #757: checks the public URL and access mode above, nothing else. */}
      <div className="pt-4 border-t border-divider flex flex-col gap-3">
        <Button size="sm" variant="bordered" color="primary" isLoading={checking} onPress={check} className="self-start">
          {t('adminConfig.network.check.button')}
        </Button>
        {checkResult && (
          <div className="flex flex-col gap-2">
            <div role={checkResult.ok ? 'status' : 'alert'} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border font-medium ${checkResult.ok ? 'bg-success-50 border-success-200 text-success-700' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>
              {checkResult.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {checkResult.ok ? t('adminConfig.network.check.success') : t('adminConfig.network.check.failure')}
            </div>
            {checkResult.warnings.length > 0 && (
              <div className="px-4 py-3 rounded-xl text-xs border bg-warning-50 border-warning-200 text-warning-700">
                <ul className="list-disc list-inside flex flex-col gap-1">
                  {checkResult.warnings.map((code) => (
                    <li key={code}>
                      {code === 'NETWORK_ERROR'
                        ? t('adminConfig.network.check.networkError')
                        : t(`adminConfig.network.check.warnings.${code}`, code)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      {stepUp.dialog}
    </ConfigCard>
  );
}
