import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GREMLINS_PATH = require.resolve('gremlins.js/dist/gremlins.min.js');

/**
 * UI fuzzing (gremlins.js) — turns a horde loose on each page: random clicks,
 * touches, scrolls and key presses, then fails if the page threw an uncaught
 * exception, logged a console error, or navigated to an error screen.
 *
 * Gremlins genuinely click destructive controls (delete buttons, …), so this
 * only runs where a wipe-and-reseed is cheap: CI (ephemeral DB), or locally
 * with E2E_ALLOW_MONKEY=1.
 */
const SEED = Number(process.env.E2E_MONKEY_SEED ?? 202608);
const GREMLIN_COUNT = Number(process.env.E2E_MONKEY_NB ?? 250);
const ROUTES = ['/bottles', '/cigars', '/collections', '/cellars', '/tastings', '/analytics', '/wishlist', '/profile'];

test.describe('gremlins UI fuzz', () => {
  test.skip(
    !process.env.CI && !process.env.E2E_ALLOW_MONKEY,
    'monkey fuzz mutates data — runs on CI or with E2E_ALLOW_MONKEY=1',
  );

  for (const route of ROUTES) {
    test(`gremlins survive ${route}`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (/favicon|Failed to load resource|net::ERR_|\[HMR\]|DevTools/i.test(t)) return;
        errors.push(`[console.error] ${t}`);
      });

      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);
      await page.addScriptTag({ path: GREMLINS_PATH });

      await page.evaluate(
        async ({ seed, nb }) => {
          // @ts-expect-error injected UMD global
          const g = window.gremlins;
          const horde = g.createHorde({
            randomizer: new g.Chance(seed),
            species: [g.species.clicker(), g.species.toucher(), g.species.scroller(), g.species.typer()],
            mogwais: [g.mogwais.alert(), g.mogwais.gizmo({ maxErrors: 1 })],
            strategies: [g.strategies.distribution({ delay: 4, nb })],
          });
          await horde.unleash();
        },
        { seed: SEED, nb: GREMLIN_COUNT },
      );

      await page.waitForTimeout(500);

      const crashed = await page
        .getByText(/Application error|Une erreur inattendue|client-side exception/i)
        .count();

      if (errors.length || crashed) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' });
        await testInfo.attach('errors', {
          body: `route=${route} seed=${SEED}\n${errors.join('\n')}`,
          contentType: 'text/plain',
        });
      }

      expect(crashed, `error screen on ${route}`).toBe(0);
      expect(errors, `\n${errors.join('\n')}\n(replay: E2E_MONKEY_SEED=${SEED})`).toEqual([]);
    });
  }
});
