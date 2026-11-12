'use client';

import React, { useState } from 'react';
import { LoadingRegion } from '@/components/ui/LoadingRegion';
import { Button, Skeleton } from '@heroui/react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppVersion } from '@/hooks/useAppVersion';
import { copyText } from '@/lib/clipboard';

/**
 * The running version with a copy button (#696), for any signed-in user:
 * the bug report template asks for it.
 */
export function AppVersion() {
  const { t } = useTranslation();
  const { data: version, isError, isPending } = useAppVersion();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!version) return;
    if (await copyText(version)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section aria-labelledby="app-version-title" className="bg-content1 border border-divider rounded-2xl p-6 mt-6">
      <h2 id="app-version-title" className="text-sm font-semibold mb-1">{t('profile.version.title')}</h2>
      <p className="text-xs text-foreground-500 mb-2">{t('profile.version.description')}</p>
      <div className="flex items-center gap-2 max-w-sm">
        {version ? (
          <code className="flex-1 px-3 py-2 rounded-lg bg-content2 border border-divider text-sm font-mono select-all">
            {version}
          </code>
        ) : (
          <div className="flex-1 px-3 py-2 text-sm text-foreground-500">
            {isPending && <LoadingRegion><Skeleton className="h-4 w-20 rounded" /></LoadingRegion>}
            {isError && t('profile.version.unavailable')}
          </div>
        )}
        <Button
          isIconOnly
          size="sm"
          variant="flat"
          isDisabled={!version}
          startContent={copied ? <Check size={14} /> : <Copy size={14} />}
          onPress={copy}
          aria-label={t('actions.copy')}
        />
      </div>
    </section>
  );
}
