import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// The library @ducanh2912/next-pwa lists public/ with, so the precache is
// computed here exactly as the build computes it.
import fg from 'fast-glob';
import { runtimeCaching as pluginDefaultCache } from '@ducanh2912/next-pwa';
import config, { pwaOptions } from '../../next.config.mjs';
import { localesVersion } from '../locales-version.mjs';

// #471 (recette v2, blocking): after an update, a page opened before it got
// raw keys and old labels until reloaded. The translations had the same URL
// in every version and were precached by the service worker: on the first
// visit after the update the previous worker, still in charge, served the
// previous file. These tests pin the three parts of the fix.

const PUBLIC_DIR = path.join(import.meta.dirname, '..', '..', 'public');
const LOCALES_DIR = path.join(PUBLIC_DIR, 'locales');

type RouteMatch = (options: { url: URL; sameOrigin: boolean; request: Request }) => boolean;
type CacheRule = { urlPattern: RegExp | RouteMatch; handler: string; options?: { cacheName?: string } };

function matches(rule: CacheRule, href: string): boolean {
  const url = new URL(href);
  if (rule.urlPattern instanceof RegExp) return rule.urlPattern.test(url.href);
  return rule.urlPattern({ url, sameOrigin: url.origin === 'https://cave.example', request: new Request(url) });
}

describe('translations after an update (#471)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('the translations URL carries the build-time fingerprint of the files', async () => {
    vi.stubEnv('NEXT_PUBLIC_LOCALES_VERSION', 'abc123');
    vi.resetModules();
    const { default: i18n, LOCALES_LOAD_PATH } = await import('../i18n');
    expect(LOCALES_LOAD_PATH).toBe('/locales/{{lng}}/{{ns}}.json?v=abc123');
    expect((i18n.options.backend as { loadPath?: string }).loadPath).toBe(LOCALES_LOAD_PATH);
  });

  it('the build passes the fingerprint of public/locales to the browser code', () => {
    const built = config('phase-production-build') as { env?: Record<string, string> };
    expect(built.env?.NEXT_PUBLIC_LOCALES_VERSION).toBe(localesVersion(LOCALES_DIR));
    expect(built.env?.NEXT_PUBLIC_LOCALES_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });

  it('the fingerprint changes with a translation, and only then', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'glou-locales-'));
    try {
      mkdirSync(path.join(dir, 'fr'));
      mkdirSync(path.join(dir, 'en'));
      writeFileSync(path.join(dir, 'fr', 'common.json'), '{"nav":{"bottles":"Vins"}}');
      writeFileSync(path.join(dir, 'en', 'common.json'), '{"nav":{"bottles":"Wines"}}');
      const before = localesVersion(dir);
      expect(localesVersion(dir)).toBe(before);
      writeFileSync(path.join(dir, 'fr', 'common.json'), '{"nav":{"bottles":"Bouteilles"}}');
      expect(localesVersion(dir)).not.toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the service worker no longer precaches the translations', () => {
    const precached = fg.sync(['**/*', ...(pwaOptions.publicExcludes ?? [])], { cwd: PUBLIC_DIR });
    expect(precached).toContain('manifest.json');
    expect(precached.filter((file) => file.startsWith('locales/'))).toEqual([]);
  });

  it('offline, the translations fetched once are kept by a network-first rule (FEAT-108)', () => {
    const href = 'https://cave.example/locales/fr/common.json?v=abc123';
    const rules = [
      ...((pwaOptions.workboxOptions as { runtimeCaching?: CacheRule[] }).runtimeCaching ?? []),
      ...(pluginDefaultCache as CacheRule[]),
    ];
    const rule = rules.find((r) => matches(r, href));
    expect(rule?.handler).toBe('NetworkFirst');
    expect(rule?.options?.cacheName).toBe('glou-locales');
    // Why the rule is needed: the plugin's own `.json` rule ends with `$`
    // and would not match the fingerprinted URL.
    const pluginJsonRule = (pluginDefaultCache as CacheRule[]).find((r) => r.options?.cacheName === 'static-data-assets');
    expect(pluginJsonRule && matches(pluginJsonRule, href)).toBe(false);
  });
});
