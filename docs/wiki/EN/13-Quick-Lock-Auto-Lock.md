# Set Up Quick Lock & Auto-Lock

## TL;DR
Lock the app instantly with one click, or let it lock itself after a period of inactivity — unlock with your password or a short PIN, without logging out.

## Prerequisites
* Logged into your account.

## Action

### Set up a PIN (optional, but required to unlock with a PIN)
1. Go to **Profile → Security**.
2. Click **Set a PIN**, enter your account password to confirm, then choose a 4-to-6-digit PIN.
3. To change or remove it later, use **Change PIN** or **Remove** in the same panel (removing it also requires your password).

### Configure auto-lock
1. In the same **Profile → Security** panel, open the **Auto-lock delay** selector.
2. Choose **Never**, **5 min**, **15 min**, or **30 min**. There is no custom delay — pick the closest option.
3. The app locks itself automatically after that many minutes without mouse, keyboard, click, or scroll activity.

### Lock and unlock
1. Click the **lock icon** in the header (next to the notification bell) to lock the app instantly, at any time.
2. A lock screen appears over the app. Unlock with your **password**, or with your **PIN** if you have set one (the PIN tab only appears if a PIN is configured).
3. If you forget both, click **Sign out** on the lock screen to end the session and log in again from scratch.

> [!TIP]
> Locking the app does **not** end your session on the server — your login stays valid. It only hides the interface behind a lock screen on this device. Use [11-Sessions-Trusted-Devices.md](./11-Sessions-Trusted-Devices.md) if you actually need to end a session remotely (e.g. a lost device).

> [!CAUTION]
> The lock state is stored per browser tab session (cleared when you fully close the browser). Refreshing the page keeps it locked, but opening the app in a new browser session starts unlocked — auto-lock does not protect a device left logged in across browser restarts.

## The Firewall (Troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **The PIN tab doesn't show on the lock screen** | No PIN has been configured for your account yet. Unlock with your password, then set one up in Profile → Security for next time. |
| **"Too many attempts" error when unlocking** | Unlock attempts are rate-limited (10 tries per 15 minutes) to prevent PIN brute-forcing. Wait 15 minutes or unlock with your full password once the limit resets. |
| **Auto-lock triggers even though I'm actively reading (not clicking)** | Auto-lock tracks mouse movement, clicks, keystrokes, and scrolling. Passive reading without any of these for the full delay will still trigger the lock — scroll or move the mouse periodically, or increase the delay. |
| **The app is still locked after I closed and reopened the browser** | Expected only if the browser restored your previous session/tabs. A fresh browser session starts unlocked. |
