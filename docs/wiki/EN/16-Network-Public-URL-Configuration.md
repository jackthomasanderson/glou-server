# Configure the public URL & network access mode

## TL;DR
Tell Glou the address people use to reach your instance from outside, so the links and shares the app generates are correct, then run the consistency check.

## Prerequisites
* Admin account.
* The exact public address of your instance (e.g. `https://cave.example.com`), if you have one.

## Action

### Set the public URL
1. Go to **Admin → System Configuration → Access**.
2. Fill in **Public URL** with the address your instance is reachable at from outside (e.g. `https://cave.example.com`). Leave it empty to fall back to the `APP_URL` environment variable, or `http://localhost:3000` if that variable isn't set either.
3. Click **Save**. The panel shows the **effective URL** actually in use (your configured value, or the `APP_URL` fallback if you left the field empty). Password reset links are built from this URL, so saving asks for your password, plus a code from your authenticator app if your account has two-factor authentication. The mail server, Gotify and notification channel settings ask the same. Bottle QR codes also use this URL (unless it is a `localhost` address), so labels printed from any machine open on a phone.

### Run the consistency check
1. Click **Verify consistency**.
2. The check is purely local and makes no outbound network call, so it does not fail because of DNS or a proxy that is not live yet. It verifies:
   - The effective URL is syntactically valid.
   - In production (`NODE_ENV=production`), the URL uses `https://`, otherwise you get a `NOT_HTTPS_IN_PRODUCTION` warning.
3. Read the result: warnings are advisory, not blocking: the check only reports `ok: false` when the URL itself is invalid.

> [!TIP]
> The public URL does not configure any server-side proxy behavior. How many reverse proxies are trusted is set in `.env` with `TRUSTED_PROXY_HOPS`, see below.

### Client address and reverse proxy
The sign-in form and the API limit how many requests one address may send (for example 20 sign-in attempts every 15 minutes). For that, the `web` container works out each client's address and hands the API that single address, whatever the client wrote in its own `X-Forwarded-For` header. `TRUSTED_PROXY_HOPS` in `.env` tells it how many reverse proxies are in front of it:

| Your install | `TRUSTED_PROXY_HOPS` | Address used |
|---|---|---|
| One reverse proxy in front of `web` (Caddy, Traefik, nginx…), the usual case | `1` (default, nothing to set) | The address your proxy appends to `X-Forwarded-For`. |
| `web` reached directly (port 3000 open on the network, no proxy) | `0` | The address of the connection itself. A forged `X-Forwarded-For` is ignored. |
| Two proxies in a row (e.g. a CDN, then Caddy) | `2` | The address the first proxy appended. The second proxy must keep the header it receives: with Caddy, list the CDN's addresses in `trusted_proxies`, or Caddy starts a new header and every visitor ends up counted on the CDN's address. |

- Your reverse proxy must **append** the client address to `X-Forwarded-For`: Caddy and Traefik do it by default; with nginx, use `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`.
- A request that carries fewer addresses than expected is counted on the address of the connection `web` received. For someone reaching `web` directly, that is their own address. Behind a proxy that does not append the client address (nginx without the line above), or with more hops set than there are proxies, it is the proxy's address, shared by every visitor: check the setting if every member gets `Too many requests` at once. An entry that is not a plain IP address (with a port, such as `203.0.113.7:5678`, or in brackets) is treated the same way.
- With `0`, `web` sees the address Docker hands it. Visitors arriving over IPv6 on a Docker network without IPv6, or every visitor with rootless Docker, reach `web` from Docker's gateway address and therefore share one address. Put a reverse proxy in front (and keep `1`) in that case.
- A value above `3` is kept, with a warning in the `web` logs at startup: set only as many hops as there are proxies.
- If `web` is reached directly while `TRUSTED_PROXY_HOPS` is still `1`, a client can choose the address it is counted on: wrong passwords are then still held back by the per-account limit, but set `0` to close that gap.
- Restart after changing it: `docker compose up -d`. Keep the API port (3001) unpublished, as in the default `docker-compose.yml`: the API trusts the `web` container only.

### Allow or close new registrations
Registration is **closed by default**: once the first account (the instance admin) exists, `POST /api/auth/register` answers `REGISTRATION_CLOSED` and the login page hides the sign-up link.
1. In the same **Access** tab, under **Who can join**, switch **Allow new accounts to register** on to let people create their own account, or off to close it again, then click **Save**. Opening it is confirmed with your password, plus your code if your account has two-factor authentication: a stolen session alone cannot let anyone in. Closing it needs no confirmation. The Members block of the admin page says whether sign-up is open, with a link here.
2. Existing accounts are not affected. The first account of an empty instance can always be created.

## The firewall (troubleshooting)

| Error / Behavior | Fix |
| :--- | :--- |
| **`NOT_HTTPS_IN_PRODUCTION` warning** | Your effective URL uses `http://` while `NODE_ENV=production`. Set **Public URL** to an `https://` address, or fix your TLS termination at the proxy. |
| **Links generated by the app still point to the wrong address** | Confirm you clicked **Save** after entering the Public URL, and re-check the **effective URL** shown in the panel: an empty field silently falls back to `APP_URL`/`localhost`. |
| **Someone cannot sign up: "New account registration is currently closed"** | Turn on **Allow new accounts to register** in this tab, let them sign up, then turn it off again. |
| **I don't have a Public URL configured. Is that a problem?** | Not for local/single-user use. Without one, Glou falls back to `APP_URL` (set in your `docker-compose.yml`) or `http://localhost:3000`. Set a Public URL only if the instance is reachable from outside and you want links to reflect that. |
