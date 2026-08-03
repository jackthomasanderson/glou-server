# Get Alerted on Security Events

## TL;DR
Glou notifies you automatically when something sensitive happens on your account — new device login, password change, 2FA toggled, or a session revoked.

## Prerequisites
* Logged into your account.
* At least one notification channel enabled (in-app and/or email) in **Profile → Notifications**.

## Action

### Understand what triggers a security alert
The **Security** notification category covers these events, with no per-event toggle — one switch controls all of them:
1. Login from a device or location not seen before on your account.
2. Password changed.
3. Two-Factor Authentication turned on or off.
4. A session revoked (yours or from the sessions panel, see [11-Sessions-Trusted-Devices.md](./11-Sessions-Trusted-Devices.md)).

Each notification includes the timestamp, the device or IP involved, and a direct link back to your security settings (`/profile#security`) so you can react immediately.

### Enable or disable security notifications
1. Go to **Profile → Notifications**.
2. Find the **Security** category chip and click it to toggle it on or off.
3. Choose your delivery channel(s) (in-app, email) using the channel switches in the same panel.

> [!CAUTION]
> Security notifications always bypass your configured quiet hours. A compromised account should not have to wait until morning — you cannot mute this category during quiet hours, only disable it entirely.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **I didn't get an email for a security event** | Check that the **email** channel is enabled in Profile → Notifications, and that the instance's SMTP configuration is active (ask your admin — this is set at the instance level, see [02-Configuration.md](./02-Configuration.md)). |
| **I want to be notified about password changes but not new-device logins** | Not possible today — the Security category is all-or-nothing. Disabling it stops all five event types listed above. |
| **I got a security notification but didn't do anything** | Treat it as a real signal. Open the link in the notification, review your active sessions ([11-Sessions-Trusted-Devices.md](./11-Sessions-Trusted-Devices.md)), and change your password if you don't recognize the device or location. |
| **The notification arrived even though I set quiet hours** | Expected. Security alerts always ignore quiet hours by design. |
