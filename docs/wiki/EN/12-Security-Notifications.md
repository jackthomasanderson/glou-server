# Get alerted on security events

## TL;DR
Glou notifies you when something sensitive happens on your account: new device login, password, email or username change, 2FA changes, or a session revoked. These alerts are always on: nobody can turn them off, and they always reach your account email when the server can send email.

## Prerequisites
* Logged into your account.
* For the email: the administrator has set up email for the instance (SMTP, see [02-Configuration.md](./02-Configuration.md)). Your own email switch in **Profile → Notifications** does not matter for security alerts.
* For a Gotify copy: the administrator has set up Gotify and you turned the Gotify channel on in **Profile → Notifications**.

## Action

### Understand what triggers a security alert
The **Account security** notification category covers these events, with no per-event toggle:
1. Login from a device or location not seen before on your account.
2. Password changed (from your profile or through a reset link).
3. Email address changed: the alert also goes to the previous address, so the owner is warned even if the new address is not theirs.
4. Username changed.
5. Two-Factor Authentication turned on or off, recovery codes regenerated, or the two-factor step locked after too many wrong codes.
6. Account deletion requested.
7. A session revoked (yours or from the sessions panel, see [11-Sessions-Trusted-Devices.md](./11-Sessions-Trusted-Devices.md)).

Administrators also get, in this category, the notices about member accounts being deleted.

Each notification includes the timestamp, the device or IP involved, and a direct link back to your security settings (`/profile#security`) so you can react.

### Why security alerts cannot be turned off
Someone who steals a signed-in session could otherwise turn these alerts off first, then change your password or email without you being told. So:
1. In **Profile → Notifications**, the **Account security** category is ticked and locked, with a note saying why.
2. The server keeps the category on whatever a browser or script sends: there is no way around the locked box.
3. Accounts that had removed the category, or turned the email channel off, before this rule are covered too: nothing to do on your side.

### Where security alerts are delivered
| Instance email (SMTP) | Your email switch | Your Gotify switch | What you receive |
| :--- | :--- | :--- | :--- |
| Set up | On or off | Off | An email to your account address. |
| Set up | On or off | On | An email to your account address, and a Gotify copy. |
| Not set up or off | — | On | A Gotify copy only. |
| Not set up or off | — | Off | Nothing can be sent: ask your administrator to set up email. Administrators still see sign-ins and account changes in the [audit log](./10-Audit-Log.md). |

Your email switch only affects the other categories (peak maturity, temperature, wishlist, backups). Turning Gotify off only stops the Gotify copy.

> [!CAUTION]
> Security notifications always bypass your configured quiet hours: they are never delayed or dropped at night.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **I didn't get an email for a security event** | Ask your admin to check the instance email (SMTP) settings: they are set at the instance level, see [02-Configuration.md](./02-Configuration.md). Your own email switch does not stop security alerts. Also check your spam folder. |
| **I can't untick Account security** | Expected: security alerts cannot be turned off. The note under the box says so. |
| **I want to be notified about password changes but not new-device logins** | Not possible: the security category is all-or-nothing and always on. |
| **I got a security notification but didn't do anything** | Open the link in the notification, review your active sessions ([11-Sessions-Trusted-Devices.md](./11-Sessions-Trusted-Devices.md)), and change your password if you don't recognize the device or location. |
| **The notification arrived even though I set quiet hours** | Expected. Security alerts always ignore quiet hours by design. |
