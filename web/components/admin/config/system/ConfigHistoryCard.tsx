'use client';
import React from 'react';
import { Chip } from '@heroui/react';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConfigHistoryEntry } from '@/lib/config/client';
import { useConfigHistory } from '@/hooks/useAdmin';
import { useHasMounted } from '@/hooks/useHasMounted';
import { formatDateTime } from '@/lib/format';
import { ConfigCard, QueryList } from '../shared';

/** Who changed which settings, and when. */
export function ConfigHistoryCard() {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const history = useConfigHistory();
  return (
    <ConfigCard id="config-history" icon={History} title={t('adminConfig.cards.history')}>
      <QueryList<ConfigHistoryEntry> query={history} emptyText={t('adminConfig.history.noHistory')}>
        {(items) => (
          <div className="flex flex-col gap-2">
            {items.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-divider last:border-0">
                <Chip size="sm" variant="flat" radius="sm">{entry.fieldName}</Chip>
                <div className="flex-1 min-w-0">
                  {entry.maskedNewVal && <p className="text-xs text-foreground-500 font-mono truncate">{entry.maskedNewVal}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-foreground-400">{entry.user?.username}</p>
                  <p className="text-xs text-foreground-300">{hasMounted ? formatDateTime(entry.createdAt, i18n.language) : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryList>
    </ConfigCard>
  );
}
