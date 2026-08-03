# Manage Active Sessions & Trusted Devices

## TL;DR
Review every device connected to your account, disconnect any of them remotely, and skip repeated 2FA prompts for 30 days on devices you mark as trusted.

## Prerequisites
* Logged into your account.
* Two-Factor Authentication enabled (see [01-Authentication.md](./01-Authentication.md)) if you want the "trust" feature to have any effect — trusting a device only skips the 2FA re-prompt, it does not replace your password.

## Action

### View and revoke sessions
1. Go to **Profile** (top-right avatar) and scroll to the **Security** section.
2. The **Active Sessions** panel lists every device currently logged into your account: device/browser, approximate location, first login date, and last activity.
3. Your current session is flagged with a **"Current session"** badge and cannot be revoked from this screen.
4. Click **Disconnect** on any other session to end it immediately. The targeted device is signed out on its next request.

> [!CAUTION]
> Revoking a session invalidates the server-side token immediately, but a browser that already has the page open may still show stale data until it makes its next request. If you suspect your account is compromised, also change your password (see [01-Authentication.md](./01-Authentication.md)).

### Trust the current device
1. From the same **Active Sessions** panel, click **Trust this device** on your current session.
2. For the next **30 days**, this device skips the 2FA prompt on login (your password is still required).
3. To undo it, click **Stop trusting** on the same session. You will be asked for 2FA again on your next login from that device.

> [!TIP]
> Trust is automatically revoked if the system detects you are connecting from a different country than when you trusted the device. You will be asked for 2FA again — this is expected behavior, not a bug.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **My session list only shows a few entries, I expected to see old logins too** | Only active (non-expired, non-revoked) sessions are listed. There is no history of past sessions. |
| **"Trust this device" doesn't stop the 2FA prompt** | Trust only applies to the device/browser combination you clicked it on. A different browser or a private/incognito window is treated as a new, untrusted device. |
| **I was suddenly asked for 2FA again after trusting my device** | Your connection was detected from a different country than when trust was granted, or the 30-day trust period expired. Re-authenticate normally; you can trust the device again afterwards. |
| **The device name shown is generic (e.g. "Unknown browser")** | The label is derived from the browser's user-agent string. Some browsers or privacy extensions send a minimal user-agent, which limits identification detail. |
