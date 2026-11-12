# Manage active sessions and trusted devices

## TL;DR
List the devices connected to your account, disconnect any of them remotely, and skip 2FA prompts for 30 days on devices you mark as trusted.

## Prerequisites
* Logged into your account.
* Two-Factor Authentication enabled (see [01-Authentication.md](./01-Authentication.md)): without it there is no code to skip, and the **Trusted device** block is not shown. Trusting a device only skips the 2FA re-prompt, it does not replace your password.

> [!TIP]
> Lost the phone that gives you your 2FA codes? See [Lost phone with 2FA on](./32-Lost-Phone-2FA.md).

## Action

### View and revoke sessions
1. Go to **Profile** (top-right avatar) and scroll to the **Security** section.
2. The **Active Sessions** panel lists every device currently logged into your account: device/browser, approximate location, first login date, and last activity.
3. Your current session is flagged with a **"Current session"** badge and cannot be revoked from this screen.
4. Click **Disconnect** on any other session to end it immediately. The targeted device is signed out on its next request.

> [!CAUTION]
> Revoking a session invalidates the server-side token immediately, but a browser that already has the page open may still show stale data until it makes its next request. If you suspect your account is compromised, also change your password (see [01-Authentication.md](./01-Authentication.md)).

### Trust the current device
1. In **Profile**, card **Sign-in and security**, the **Trusted device** block (below two-factor authentication) says whether the device you are using is trusted, and until when.
2. If it is not, click **Trust this device**, then confirm with your password and a two-factor code. For the next **30 days**, this device skips the 2FA prompt on login (your password is still required).
3. If it is, the block shows "trusted until …" and a single button, **Remove trust**. You will be asked for 2FA again on your next login from that device.

> [!TIP]
> Trust is revoked if the system detects you are connecting from a different country than when you trusted the device. You will be asked for 2FA again: this is expected behavior.

### Sign-in locked after wrong passwords
After **10 wrong passwords in 15 minutes** for one username or e-mail, sign-in with that username or e-mail is refused until the 15 minutes are over, from any address and even with the right password ("Too many attempts"). Your username and your e-mail each have their own count. Open sessions are not affected.

Someone who knows your username or e-mail could renew this lock every 15 minutes. The lock does not apply to you, as long as you type the right password, when you sign in:
* from a **browser where you already signed in** to this account (with or without 2FA). Every successful sign-in leaves a "known browser" mark in that browser, valid **30 days** from your last sign-in there. It never skips the 2FA code: with 2FA on, the code is still asked. The mark stops working as soon as your password changes (by you, through a reset link, or by an administrator's reset), and is kept when you sign out;
* from a **trusted device** (2FA accounts, see above).

Wrong passwords typed from such a browser or device are limited too: 10 per 15 minutes for that browser or device. A browser where you never signed in (a new one, a private window, cleared cookies) is not covered: wait for the end of the 15 minutes. Each lock is written in the audit log under your account (`sign_in_locked`), once per 15 minutes.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **My session list only shows a few entries, I expected to see old logins too** | Only active (non-expired, non-revoked) sessions are listed. There is no history of past sessions. |
| **"Trust this device" doesn't stop the 2FA prompt** | Trust only applies to the device/browser combination you clicked it on. A different browser or a private/incognito window is treated as a new, untrusted device. |
| **I was suddenly asked for 2FA again after trusting my device** | Your connection was detected from a different country than when trust was granted, or the 30-day trust period expired. Re-authenticate normally; you can trust the device again afterwards. |
| **"Too many attempts" at sign-in although my password is right** | Your username or e-mail received 10 wrong passwords in the last 15 minutes, maybe from someone else. Sign in from a browser where you already signed in, or a trusted device, or wait 15 minutes (see *Sign-in locked after wrong passwords*). Telling an administrator lets them check the audit log. |
| **The device name shown is generic (e.g. "Unknown browser")** | The label is derived from the browser's user-agent string. Some browsers or privacy extensions send a minimal user-agent, which limits identification detail. |
