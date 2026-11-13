'use client';
import React from 'react';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ConfigHistoryEntry } from '@/lib/config/client';
import { useConfigHistory } from '@/hooks/useAdmin';
import { useHasMounted } from '@/hooks/useHasMounted';
import { formatDateTime } from '@/lib/format';
import { ConfigCard, QueryList } from '../shared';
import { HISTORY_FIELDS, HISTORY_SECTIONS, historyFieldKind } from './configHistoryFields';

type Values = Record<string, unknown>;

/** A stored JSON object, or null when the column is empty or not an object. */
function parseValues(raw: string | null): Values | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Values) : null;
  } catch {
    return null;
  }
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

/** The setting's label; a field the table does not know gets a generic one. */
function fieldLabel(t: TFunction, field: string): string {
  return Object.hasOwn(HISTORY_FIELDS, field)
    ? t(`adminConfig.history.fields.${field}`)
    : t('adminConfig.history.unknownField');
}

/** A non-secret value as the admin reads it: on/off, days, an hour, a translated choice. */
function formatValue(t: TFunction, field: string, value: unknown): string {
  if (isEmpty(value)) return t('adminConfig.history.empty');
  const kind = historyFieldKind(field);
  if (typeof value === 'boolean') return t(value ? 'adminConfig.history.on' : 'adminConfig.history.off');
  if (kind === 'days' && typeof value === 'number') return t('adminConfig.history.days', { count: value });
  if (kind === 'hour' && typeof value === 'number') return t('adminConfig.history.hour', { hour: String(value).padStart(2, '0') });
  if (kind === 'enum') {
    return t(`adminConfig.history.values.${field}.${String(value)}`, { defaultValue: String(value) });
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** One sentence per changed setting: old → new, a secret only "changed", "set" or "removed". */
function changeLines(t: TFunction, before: Values, after: Values): string[] {
  return Object.keys(after).map((field) => {
    const label = fieldLabel(t, field);
    const from = before[field];
    const to = after[field];
    if (historyFieldKind(field) === 'secret') {
      if (isEmpty(to)) return t('adminConfig.history.removed', { field: label });
      return t(isEmpty(from) ? 'adminConfig.history.secretSet' : 'adminConfig.history.secretChanged', { field: label });
    }
    if (isEmpty(to) && !isEmpty(from)) return t('adminConfig.history.removed', { field: label });
    return t('adminConfig.history.changed', {
      field: label, from: formatValue(t, field, from), to: formatValue(t, field, to),
    });
  });
}

/** Entries written before #760: the whole form that was saved, without previous values. */
function legacyLines(t: TFunction, saved: Values): string[] {
  return Object.keys(saved).map((field) => {
    const label = fieldLabel(t, field);
    return historyFieldKind(field) === 'secret'
      ? t('adminConfig.history.legacySecret', { field: label })
      : t('adminConfig.history.legacyValue', { field: label, value: formatValue(t, field, saved[field]) });
  });
}

function EntryDetails({ entry }: { entry: ConfigHistoryEntry }) {
  const { t } = useTranslation();
  const before = parseValues(entry.maskedOldVal);
  const after = parseValues(entry.maskedNewVal);
  const isLegacy = before === null;
  const lines = after ? (isLegacy ? legacyLines(t, after) : changeLines(t, before, after)) : [];
  if (lines.length === 0) return <p className="text-sm text-foreground-500">{t('adminConfig.history.noDetails')}</p>;
  return (
    <>
      {isLegacy && <p className="text-xs text-foreground-400">{t('adminConfig.history.legacyIntro')}</p>}
      <ul className="flex flex-col gap-0.5">
        {lines.map((line, i) => <li key={i} className="text-sm text-foreground-600 break-words">{line}</li>)}
      </ul>
    </>
  );
}

/** Who changed which settings, from what to what, and when (#760). */
export function ConfigHistoryCard() {
  const { t, i18n } = useTranslation();
  const hasMounted = useHasMounted();
  const history = useConfigHistory();
  const sectionTitle = (section: string) =>
    (HISTORY_SECTIONS as readonly string[]).includes(section)
      ? t(`adminConfig.history.sections.${section}`)
      : t('adminConfig.history.unknownSection');
  return (
    <ConfigCard id="config-history" icon={History} title={t('adminConfig.cards.history')}>
      <QueryList<ConfigHistoryEntry> query={history} emptyText={t('adminConfig.history.noHistory')}>
        {(items) => (
          <ul className="flex flex-col gap-2">
            {items.map((entry) => (
              <li key={entry.id} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-2 border-b border-divider last:border-0">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <p className="text-sm font-medium">{sectionTitle(entry.fieldName)}</p>
                  <EntryDetails entry={entry} />
                </div>
                <div className="sm:text-right shrink-0">
                  <p className="text-xs text-foreground-500">
                    {t('adminConfig.history.by', { user: entry.user?.username ?? entry.actorName ?? t('adminConfig.history.unknownUser') })}
                  </p>
                  <p className="text-xs text-foreground-400">{hasMounted ? formatDateTime(entry.createdAt, i18n.language) : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryList>
    </ConfigCard>
  );
}
