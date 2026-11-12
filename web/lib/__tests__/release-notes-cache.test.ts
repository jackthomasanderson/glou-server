import { describe, expect, it } from 'vitest';
import { runtimeCaching as pluginDefaultCache } from '@ducanh2912/next-pwa';
import { pwaOptions } from '../../next.config.mjs';

// FEAT-115 (#990): the What's New? window opens only with the server's answer.
// The plugin's default rule would answer GET /api/admin/release-notes from a
// cache (NetworkFirst): offline, notes already seen on another device would
// show again.

type RouteMatch = (options: { url: URL; sameOrigin: boolean; request: Request }) => boolean;
type CacheRule = { urlPattern: RegExp | RouteMatch; handler: string };

function ruleFor(href: string): CacheRule | undefined {
  const url = new URL(href);
  const rules = [
    ...((pwaOptions.workboxOptions as { runtimeCaching?: CacheRule[] }).runtimeCaching ?? []),
    ...(pluginDefaultCache as CacheRule[]),
  ];
  return rules.find((rule) => (rule.urlPattern instanceof RegExp
    ? rule.urlPattern.test(url.href)
    : rule.urlPattern({ url, sameOrigin: url.origin === 'https://cave.example', request: new Request(url) })));
}

describe('release notes and the service worker (#990)', () => {
  it('never answers the release notes from a cache', () => {
    expect(ruleFor('https://cave.example/api/admin/release-notes')?.handler).toBe('NetworkOnly');
  });
});
