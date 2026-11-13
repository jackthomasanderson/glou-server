'use client';
import React, { useState } from 'react';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Button, Skeleton } from '@heroui/react';
import { Info, Copy, Check, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppVersion } from '@/hooks/useAppVersion';
import { copyText } from '@/lib/clipboard';
import { ConfigCard } from '../shared';
import { useWhatsNew } from '@/components/whats-new/WhatsNewProvider';

/**
 * #285: a version a bug reporter can copy, instead of the moving
 * `latest`/`beta` image tag. #615: an unreadable version says so.
 * FEAT-115 (#990): next to it, the What's New? link reopens the release notes.
 */
export function VersionCard() {
  const { t } = useTranslation();
  const { data: version, isPending, isError } = useAppVersion();
  const [copied, setCopied] = useState(false);
  const whatsNew = useWhatsNew();

  const copy = async () => {
    if (!version) return;
    if (await copyText(version)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ConfigCard id="config-version" icon={Info} title={t('adminConfig.version.title')} description={t('adminConfig.version.description')}>
      <div className="flex items-center gap-2 max-w-sm">
        <code className="flex-1 px-3 py-2 rounded-lg bg-content2 border border-divider text-sm font-mono select-all">
          {isPending && <LoadingRegion><Skeleton className="h-4 w-20 rounded" /></LoadingRegion>}
          {isError && <span className="font-sans text-foreground-500">{t('adminConfig.version.unavailable')}</span>}
          {version}
        </code>
        <Button
          isIconOnly size="sm" variant="flat"
          isDisabled={!version}
          startContent={copied ? <Check size={14} /> : <Copy size={14} />}
          onPress={copy}
          aria-label={t('actions.copy')}
        />
      </div>
      {whatsNew && (
        <Button size="sm" variant="flat" className="mt-3" startContent={<Megaphone size={14} />} onPress={whatsNew.open}>
          {t('whatsNew.open')}
        </Button>
      )}
    </ConfigCard>
  );
}
