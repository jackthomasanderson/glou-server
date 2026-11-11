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

/** The key has no plain text of its own: only plural forms (`_one`, `_other`…). */
function isPluralOnly(tree: Tree, key: string): boolean {
  const parts = key.split('.');
  const leaf = parts.pop()!;
  let node: string | Tree | undefined = tree;
  for (const part of parts) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'object' || typeof node[leaf] === 'string') return false;
  return Object.keys(node).some((k) => /^(.+)_(zero|one|two|few|many|other)$/.test(k) && k.startsWith(`${leaf}_`) && typeof node[k] === 'string');
}

/** The text of a call's arguments after the key, up to its closing parenthesis. */
function callRest(src: string, from: number): string {
  let depth = 1;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return src.slice(from, i);
  }
  return src.slice(from);
}

/**
 * #842: i18next picks a plural form only from `count`. A plural-only key called
 * without it shows as a raw key. Options handed over as a variable or spread cannot be
 * read here and are let through; so is a `context` (the contextual form decides).
 */
function lacksCount(rest: string): boolean {
  const opts = rest.replace(/^\s*,\s*/, '');
  if (opts.trim() === '') return true;
  if (!opts.trim().startsWith('{')) return false;
  return !/\bcount\b|\bcontext\b|\.\.\./.test(opts);
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
const T_CALL = /\b(?:t|translate)\(\s*'([a-zA-Z]\w*(?:\.\w+)+)'/g;

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

describe('plural-only keys are called with a count (#842)', () => {
  it('flags a call with no count, passes count, context and variable options', () => {
    expect(lacksCount(", { name })")).toBe(true);
    expect(lacksCount("")).toBe(true);
    expect(lacksCount(", { count: 2 }")).toBe(false);
    expect(lacksCount(", { count }")).toBe(false);
    expect(lacksCount(", { context: 'cigar', count: 2 }")).toBe(false);
    expect(lacksCount(", opts")).toBe(false);
    expect(lacksCount(", { ...options, cellar }")).toBe(false);
    const src = "t('a.b') + t('a.b', { count: 1 })";
    expect(lacksCount(callRest(src, src.indexOf("'a.b'") + 5))).toBe(true);
    expect(lacksCount(callRest(src, src.lastIndexOf("'a.b'") + 5))).toBe(false);
    expect(isPluralOnly({ a: { b_one: 'x', b_other: 'y' } }, 'a.b')).toBe(true);
    expect(isPluralOnly({ a: { b: 'x', b_one: 'x' } }, 'a.b')).toBe(false);
    expect(isPluralOnly({ a: { b_cigar: 'x' } }, 'a.b')).toBe(false);
  });

  const root = path.join(import.meta.dirname, '..', '..');
  const sources = ['app', 'components', 'hooks', 'lib'].flatMap((dir) =>
    (readdirSync(path.join(root, dir), { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file) && !/__tests__/.test(file))
      .map((file) => path.join(root, dir, file)));

  it.each(Object.keys(LOCALES) as (keyof typeof LOCALES)[])('no %s plural-only key is written without count', (lng) => {
    const bare = new Set<string>();
    for (const file of sources) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(T_CALL)) {
        if (isPluralOnly(LOCALES[lng], m[1]) && lacksCount(callRest(src, m.index! + m[0].length))) {
          bare.add(`${path.relative(root, file)}: ${m[1]}`);
        }
      }
    }
    expect([...bare]).toEqual([]);
  });
});
