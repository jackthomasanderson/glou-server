# Profile, preferences, and admin

## TL;DR
Everything lives in `/profile`: identity, language, theme, accent color, notifications. The admin block only appears for users with the `admin` role.
Branding (name, tagline, logo) is global and stored in the `app_settings` table.

## Prerequisites
- You are signed in; `admin` role is required for the Administration section.
- Backend reachable (mutations go through `/api/profile/*` and `/api/admin/*`).
- Webhook/Gotify URLs must be reachable from the server if you run notification tests.

## Action
1. Open `/profile` from the user menu.
2. Identity: edit display name, avatar URL, and tagline; empty values are allowed.
3. Preferences: pick language (FR/EN), theme (light/dark), and accent color in hex `#RRGGBB`.
4. Notifications: fill webhook/Gotify URLs, tick channels and categories, then send a test to confirm reachability.
5. Click Save to persist; the UI performs optimistic updates and then refreshes the data.
6. Admin section (if visible): update app name/tagline/logo, and change user roles via the selector (admin/user).

## Why is it failing?
- Validation error: accent color must follow `#RRGGBB`; webhook/Gotify URLs must be valid.
- Notification test fails: the API returns the remote HTTP code; check the URL, firewalls, or missing HTTPS.
- Admin section missing: your account is not admin; only the first user or those promoted via admin can see it.
- Changes not reflected: the request failed or cache was not invalidated; reload the page and check API logs.
