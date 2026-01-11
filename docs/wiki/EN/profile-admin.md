# Profile, preferences, and admin

## TL;DR
Everything lives in `/profile`: identity, language, theme, accent color, notifications. The admin block only appears for users with the `admin` role.
Branding (name, tagline, logo) is global and stored in the `app_settings` table.

- Webhook/Gotify URLs must be reachable from the server if you run notification tests.

## Action
1. Open `/profile` from the user menu.
2. Identity: edit display name, avatar URL, and tagline; empty values are allowed.
3. Preferences: pick language (FR/EN), theme (light/dark), and accent color in hex `#RRGGBB`.
4. Notifications: fill webhook/Gotify URLs, tick channels and categories, then send a test to confirm reachability.
5. Click Save to persist; the UI performs optimistic updates and then refreshes the data.
6. Admin section (if visible): update app name/tagline/logo, and change user roles via the selector (admin/user).



- Changes not reflected: the request failed or cache was not invalidated; reload the page and check API logs.

### Overview
User profiles allow each user to manage their identity, preferences (language, theme, accent color), and notification settings. Admins can also manage global branding and user roles.

### Main Endpoints
- `GET /api/profile/me` — Get current user's profile and preferences
- `PATCH /api/profile/me` — Update current user's profile and preferences
- `POST /api/profile/notifications/test` — Test notification channels (webhook, Gotify)
- `GET /api/profile/app-settings` — Public: get branding (name, tagline, logo)
- `GET /api/admin/users` — List all users (admin only)
- `PATCH /api/admin/users/:userId/role` — Change a user's role (admin only)
- `GET /api/admin/app-settings` — Get global branding (admin only)
- `PATCH /api/admin/app-settings` — Update global branding (admin only)

### Frontend/Backend Integration
- **Frontend**: Uses React Query for fetching and optimistic mutation of profile and admin data. Profile page (`/profile`) allows editing identity, preferences, and notifications. Admins see extra controls for branding and user management.
- **Backend**: Express routes validate input (Zod), enforce authentication/authorization, and persist changes to PostgreSQL. Notification tests POST to user-supplied URLs and return HTTP status.
- **Optimistic UI**: Mutations update the UI instantly; errors trigger rollback and show a visual fallback.
- **Internationalization**: All user-facing strings are translated (EN/FR) via a central provider.

### Data Model (Profile)
- `displayName`, `avatarUrl`, `tagline`: User identity
- `preferredLocale`, `themeMode`, `accentColor`: Preferences
- `notificationSettings`: Channels, categories, quiet hours, webhook/Gotify URLs

### Error Handling
- All endpoints return structured errors; validation issues are detailed for the frontend.
- Notification test returns remote HTTP status and error if unreachable.

### Security
- All mutations require authentication; admin endpoints require `admin` role.
- Input is validated and sanitized; secrets and roles are never exposed in responses.

### See also
- See `/web/lib/profile/client.ts` for frontend API integration.
