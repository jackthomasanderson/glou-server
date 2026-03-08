# Connect to the API and access protected routes

**TL;DR** : Authentication uses an HttpOnly cookie. Send your login/register requests with `credentials: 'include'` to automatically receive and use the token.

## Prerequisites
- Frontend and Backend must serve locally (respectively on ports 3000 and 3001).
- The PostgreSQL database must be accessible locally (`docker-compose up -d db`).

## Action : Login Flow

1. Call the `POST /api/auth/register` (or `/login`) endpoint with your `email` (or `username`) and `password`.
2. Ensure you have configured the web client to include credentials to accept the returned `accessToken` cookie.
   *Example (fetch)* : `fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({...}), credentials: 'include' })`
3. Upon a successful login, the browser will store the cookie securely in the background.
4. For calls to protected routes (`/api/bottles` or `/api/auth/me`), no manual header setup is required. The `credentials: 'include'` parameter handles the implicit cookie transmission.

> [!TIP]
> On Next.js, our Axios / Fetch abstraction already handles cookie propagation.

> [!CAUTION]
> Never attempt to extract the cookie via JS (`document.cookie`). The token is strictly limited to the backend via the HttpOnly flag to prevent XSS attacks.

## The "Firewall" (Troubleshooting)

| Error / Symptom | Probable Cause | Solution |
| :--- | :--- | :--- |
| `500 Internal Server Error` (on `/api/auth/*`) | Lost connection to PostgreSQL database (`P1001` or `P1012`). | Verify the Docker `db` container is running: `docker-compose up -d db` and restart the backend if it cannot reconnect automatically. |
| `401 Unauthorized` on `/api/bottles` | The JWT cookie was not sent, expired, or missing. | Ensure the frontend HTTP client has the `credentials: 'include'` configuration (already set on the native HttpClient) and that the user logged in successfully. |
| `404 Not Found` rendering web forms | Translation files (`common.json`) are missing or failed to load. | Ensure `i18n.ts` is imported correctly and that the API service hasn't crashed, which would block dynamic translation requests. |
