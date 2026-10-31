import { formatCurrency, formatDate } from '@/lib/format';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const MONEY_FIELDS = new Set(['purchasePrice', 'estimatedValue']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

/**
 * #508: the item history showed raw technical names and values
 * ("cellarId: "3f2a…""). Translated field label, falling back to a
 * readable split of the camelCase key for the rare field without one.
 */
export function historyFieldLabel(field: string, t: Translate): string {
  return t(`inventory.fields.${field}`, {
    defaultValue: field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
  });
}

export interface HistoryValueContext {
  lang?: string;
  /** Resolves a cellar id to its name; unknown ids (deleted cellar) render as "—". */
  cellarName?: (id: string) => string | undefined;
}

/** #585: a list of records (collections…) printed "[object Object]". */
function formatListEntry(entry: unknown): string {
  if (typeof entry === 'object' && entry !== null) {
    const { name, label } = entry as { name?: unknown; label?: unknown };
    if (typeof name === 'string') return name;
    if (typeof label === 'string') return label;
    return JSON.stringify(entry);
  }
  return String(entry);
}

/** Human-readable rendering of a raw field value from the history or a sync conflict. */
export function formatHistoryValue(field: string, value: unknown, t: Translate, ctx: HistoryValueContext = {}): string {
  if (value === null || value === undefined || value === '') return t('actions.none');
  if (typeof value === 'boolean') return value ? t('traceability.booleanTrue') : t('traceability.booleanFalse');
  if (Array.isArray(value)) return value.length > 0 ? value.map(formatListEntry).join(', ') : t('actions.none');
  if (field === 'cellarId' && typeof value === 'string') return ctx.cellarName?.(value) ?? '—';
  if (field === 'category' && typeof value === 'string') return t(`categories.${value}`, { defaultValue: value });
  if (field === 'fillLevel' && typeof value === 'number') return `${value}%`;
  if (MONEY_FIELDS.has(field) && typeof value === 'number') return formatCurrency(value, ctx.lang);
  if (typeof value === 'string' && ISO_DATE.test(value)) return formatDate(value, ctx.lang) || value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
