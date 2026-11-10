import { systemConfigService } from './system-config.service';
import { normalizeGotifyUrl } from '../lib/gotify-url';
import { assertUrlAllowed } from '../lib/ssrf';

/** Why a message did not reach the instance's Gotify server: stable codes, never a raw status. */
export type GotifyError = 'GOTIFY_NOT_CONFIGURED' | 'INVALID_URL' | 'DELIVERY_FAILED';
export type GotifyResult = { success: true } | { success: false; error: GotifyError };

const GOTIFY_TIMEOUT_MS = 5000;

/**
 * #767: whether the instance's Gotify server can be used — the channel is on
 * and both the URL and the app token are saved. Gotify refuses a message
 * without a token, so a URL alone is not a usable server.
 */
export function isGotifyUsable(cfg: { gotifyEnabled: boolean; gotifyUrl: string | null }, hasToken: boolean): boolean {
  return cfg.gotifyEnabled && !!cfg.gotifyUrl && hasToken;
}

export const gotifyService = {
  /**
   * #767: whether saving `patch` would leave the channel on without its URL
   * or its app token. Switching it off is always allowed.
   */
  async wouldBeOnWithoutServer(patch: { gotifyEnabled?: boolean; gotifyUrl?: string | null; gotifyToken?: string | null }): Promise<boolean> {
    if (patch.gotifyEnabled === false) return false;
    const saved = await systemConfigService.getPublic();
    const enabled = patch.gotifyEnabled ?? saved.gotifyEnabled;
    const url = patch.gotifyUrl !== undefined ? patch.gotifyUrl : saved.gotifyUrl;
    const hasToken = patch.gotifyToken !== undefined ? !!patch.gotifyToken : !!saved.gotifyTokenMasked;
    return enabled && !isGotifyUsable({ gotifyEnabled: true, gotifyUrl: url }, hasToken);
  },

  /**
   * #767: every Gotify message goes to the instance's server (URL + app token
   * saved in Administration): member notifications, the member's test and the
   * admin's test. Off or not configured: nothing is sent.
   *
   * ISSUE_048: the URL is checked with `lib/ssrf.ts` (HTTPS, public
   * addresses only) before each call, not only when the admin saves it (a
   * URL saved before that guard existed, or a DNS answer that changed).
   * #599: that check covers this one address only, so redirects are not
   * followed (a 307 would replay the POST elsewhere): a 3xx is a failure.
   */
  async post(title: string, message: string): Promise<GotifyResult> {
    const cfg = await systemConfigService.getGotify();
    if (!isGotifyUsable(cfg, !!cfg.gotifyToken)) return { success: false, error: 'GOTIFY_NOT_CONFIGURED' };

    const url = normalizeGotifyUrl(cfg.gotifyUrl!);
    try {
      await assertUrlAllowed(url);
    } catch {
      return { success: false, error: 'INVALID_URL' };
    }

    // The raw HTTP status / network error message is a reconnaissance
    // instrument for mapping what the server container can reach internally:
    // a stable, generic code is returned instead.
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': cfg.gotifyToken! },
        body: JSON.stringify({ title, message }),
        redirect: 'manual',
        signal: AbortSignal.timeout(GOTIFY_TIMEOUT_MS),
      });
      return res.ok ? { success: true } : { success: false, error: 'DELIVERY_FAILED' };
    } catch {
      return { success: false, error: 'DELIVERY_FAILED' };
    }
  },
};
