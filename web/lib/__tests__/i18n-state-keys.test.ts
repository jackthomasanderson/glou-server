import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import en from '../../public/locales/en/common.json';
import fr from '../../public/locales/fr/common.json';
import { ALERT_STATUSES, CATEGORY_VALUES, SPARKLING_TYPES, SUGAR_LEVELS, WINE_COLORS } from '@shared/inventory';
import { CORRECTION_REASONS, TASTING_READINESS } from '@shared/product';
import { NOTIFICATION_CATEGORIES } from '@shared/notifications';
import { EXPORT_CATEGORIES } from '@shared/auth';
import { MAP_OPENED_STATE_LABELS } from '../analytics/mapFilters';

// Acceptance run v3 of #471: the map's state filter showed raw keys
// (analytics.map.filters.stateAll…), built from its states and missing from
// both languages. A key built from a value is checked here for every value of
// its constant; a key written whole is checked by the scan below.

type Tree = { [key: string]: string | Tree };
const LOCALES = { fr: fr as Tree, en: en as Tree };

/** A key is there, as itself or as plural forms (`_one`, `_other`). */
function exists(tree: Tree, key: string): boolean {
  const parts = key.split('.');
  const leaf = parts.pop()!;
  let node: string | Tree | undefined = tree;
  for (const part of parts) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'object') return false;
  return typeof node[leaf] === 'string' || Object.keys(node).some((k) => k.startsWith(`${leaf}_`) && typeof node[k] === 'string');
}

const built: Record<string, readonly string[]> = {
  'categories.%': CATEGORY_VALUES,
  'inventory.color.%': WINE_COLORS,
  'inventory.alertStatus.%': ALERT_STATUSES,
  'inventory.sparklingTypes.%': SPARKLING_TYPES,
  'inventory.sugarLevels.%': SUGAR_LEVELS,
  'tastings.readiness.%': TASTING_READINESS,
  'notifications.categories.%': NOTIFICATION_CATEGORIES,
  'gdpr.exportCategories.%': EXPORT_CATEGORIES,
  'stockLine.correct.reasons.%.label': CORRECTION_REASONS,
  'stockLine.correct.reasons.%.hint': CORRECTION_REASONS,
  '%': Object.values(MAP_OPENED_STATE_LABELS),
};

describe('keys built from a state', () => {
  it.each(Object.keys(LOCALES) as (keyof typeof LOCALES)[])('every state has its %s label', (lng) => {
    const missing = Object.entries(built).flatMap(([pattern, values]) =>
      values.map((value) => pattern.replaceAll('%', value)).filter((key) => !exists(LOCALES[lng], key)));
    expect(missing).toEqual([]);
  });
});

/** t('a.b'), notifySuccess / notifyError / notifyWarning / notifyUndoable('a.b'), translate('a.b'), labelKey: 'a.b'. */
const KEY_WRITTEN = /(?:\b(?:t|translate|notify(?:Success|Error|Warning|Undoable))\(\s*|\blabelKey:\s*)'([a-zA-Z]\w*(?:\.\w+)+)'/g;

describe('keys written whole', () => {
  const root = path.join(import.meta.dirname, '..', '..');
  const sources = ['app', 'components', 'hooks', 'lib'].flatMap((dir) =>
    (readdirSync(path.join(root, dir), { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file) && !/__tests__/.test(file))
      .map((file) => path.join(root, dir, file)));

  it.each(Object.keys(LOCALES) as (keyof typeof LOCALES)[])('every key written in the code has its %s text', (lng) => {
    const missing = new Set<string>();
    for (const file of sources) {
      // t('…'), and the keys handed to the message helpers (they translate at call time).
      for (const [, key] of readFileSync(file, 'utf8').matchAll(KEY_WRITTEN)) {
        if (!exists(LOCALES[lng], key)) missing.add(`${path.relative(root, file)}: ${key}`);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
