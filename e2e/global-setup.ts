import { request, type FullConfig } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export const AUTH_FILE = './.auth/user.json';
export const CREDS_FILE = './.auth/creds.json';

export interface E2ECreds {
  username: string;
  email: string;
  password: string;
}

/**
 * Registers (or re-logs-in) a dedicated E2E user against the running stack,
 * skips the onboarding wizard so specs land straight on the app, and writes
 * the resulting authenticated storage state to `.auth/user.json` (consumed by
 * `use.storageState` in playwright.config.ts).
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? process.env.BASE_URL ?? 'http://localhost:3000';

  // A stable-ish identity: reused across local runs, unique enough per CI run.
  const tag = process.env.E2E_USER_TAG ?? (process.env.CI ? `ci${Date.now()}` : 'local');
  const creds: E2ECreds = {
    username: `e2e_${tag}`.slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, ''),
    email: `e2e_${tag}@glou.test`,
    password: 'e2e-battery-pw-0000',
  };

  // Reuse a still-valid session from a previous local run — avoids burning the
  // auth rate-limiter on repeated `npx playwright test` invocations. CI always
  // starts from a clean checkout, so this branch never fires there.
  if (!process.env.CI && existsSync(AUTH_FILE) && existsSync(CREDS_FILE)) {
    const warm = await request.newContext({ baseURL, storageState: AUTH_FILE });
    const me = await warm.get('/api/auth/me');
    if (me.ok()) {
      await warm.patch('/api/user/preferences', { data: { language: 'FR' } });
      await warm.dispose();
      return;
    }
    await warm.dispose();
  }

  const ctx = await request.newContext({ baseURL });

  let res = await ctx.post('/api/auth/register', {
    data: { username: creds.username, email: creds.email, password: creds.password, displayName: 'E2E Battery' },
  });

  if (res.status() === 409 || res.status() === 400) {
    // Already registered (a previous local run) — just log in.
    res = await ctx.post('/api/auth/login', {
      data: { identifier: creds.username, password: creds.password },
    });
  }

  if (!res.ok()) {
    throw new Error(`E2E auth setup failed: ${res.status()} ${await res.text()}`);
  }

  // Skip the FEAT-56 onboarding wizard for this user.
  await ctx.post('/api/user/onboarding/complete', { data: { skipped: true } });

  // Normalise preferences so specs start from a known state (French UI) even
  // if a previous run's i18n spec was interrupted mid-toggle.
  await ctx.patch('/api/user/preferences', { data: { language: 'FR' } });

  // Ensure the shared inventory has a handful of items so the analytics
  // dashboard has something to chart (a fresh CI database is empty; a local
  // instance already has data, so this is a no-op there).
  const existing = await ctx.get('/api/inventory');
  const count = existing.ok() ? ((await existing.json())?.data?.length ?? (await existing.json())?.length ?? 0) : 0;
  if (!count) {
    const now = new Date().getFullYear();
    const fixtures = [
      { category: 'wine', name: 'E2E Bordeaux', producer: 'E2E Domaine', region: 'Bordeaux', vintage: now - 6, estimatedValue: 90, peakMaturityFrom: now, peakMaturityTo: now + 8 },
      { category: 'wine', name: 'E2E Bourgogne', producer: 'E2E Domaine', region: 'Bourgogne', vintage: now - 4, estimatedValue: 140, peakMaturityFrom: now + 1, peakMaturityTo: now + 6 },
      { category: 'spirit', name: 'E2E Whisky', producer: 'E2E Distillery', region: 'Speyside', alcoholDegree: 43, estimatedValue: 70 },
      { category: 'cigar', name: 'E2E Cigar', producer: 'E2E Factory', leafOrigin: 'Cuba', quantity: 10, estimatedValue: 25 },
    ];
    for (const f of fixtures) await ctx.post('/api/inventory', { data: f });
  }

  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  await ctx.storageState({ path: AUTH_FILE });
  writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));

  await ctx.dispose();
}
