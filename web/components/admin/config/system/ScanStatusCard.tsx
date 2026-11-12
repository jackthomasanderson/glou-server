'use client';
import React from 'react';
import { Chip } from '@heroui/react';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScanStatus } from '@/hooks/useScan';
import { ConfigCard } from '../shared';

const SCAN_PROFILE_COMMAND = 'docker compose --profile scan up -d';

/** FEAT-88 (#639): label scanning has no setting, the service runs with `--profile scan`. */
export function ScanStatusCard() {
  const { t } = useTranslation();
  const { data } = useScanStatus();
  return (
    <ConfigCard
      id="config-scan"
      icon={Camera}
      title={t('adminConfig.scan.title')}
      status={data && (
        <Chip size="sm" variant="flat" color={data.available ? 'success' : 'default'}>
          {t(data.available ? 'adminConfig.scan.active' : 'adminConfig.scan.inactive')}
        </Chip>
      )}
    >
      {data && !data.available && (
        <p className="text-xs text-foreground-500">
          {t('adminConfig.scan.howToEnable')}{' '}
          <code className="rounded bg-default-100 px-1 py-0.5 font-mono">{SCAN_PROFILE_COMMAND}</code>
        </p>
      )}
    </ConfigCard>
  );
}
