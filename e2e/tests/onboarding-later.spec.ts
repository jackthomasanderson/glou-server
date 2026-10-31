import { test, expect, request, type APIResponse } from '@playwright/test';
import { creds } from './_helpers';

/**
 * FEAT-90: "Later" closes the setup wizard for the current sign-in only. It is
 * stored on the session, so it is checked here against a real PostgreSQL (the
 * API's "integration" tests mock Prisma): the session that chose "Later" sees
 * the wizard postponed, a fresh sign-in does not. API level only — the suite's
 * user has already finished the wizard, so the web never shows it anyway.
 */

type OnboardingState = {
  postponed: boolean;
  joining: boolean;
  wizardCellar: { id: string; name: string } | null;
  cellarCount: number;
  bottleCount: number;
  cigarCount: number;
};

async function okData<T>(res: APIResponse): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).data as T;
}

test('"Later" postpones the wizard for this sign-in, not the next one', async ({ page, baseURL }) => {
  const before = await okData<OnboardingState>(await page.request.get('/api/user/onboarding'));
  expect(typeof before.cellarCount).toBe('number');
  expect(typeof before.bottleCount).toBe('number');

  await okData(await page.request.post('/api/user/onboarding/postpone'));
  const after = await okData<OnboardingState>(await page.request.get('/api/user/onboarding'));
  expect(after.postponed).toBe(true);

  // A new sign-in is a new session: the wizard is no longer postponed there.
  const fresh = await request.newContext({ baseURL });
  try {
    const { username, password } = creds();
    await okData(await fresh.post('/api/auth/login', { data: { identifier: username, password } }));
    const nextSignIn = await okData<OnboardingState>(await fresh.get('/api/user/onboarding'));
    expect(nextSignIn.postponed).toBe(false);
  } finally {
    await fresh.dispose();
  }
});
