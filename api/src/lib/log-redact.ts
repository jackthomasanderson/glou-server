/**
 * ISSUE_490: guest share tokens and password-reset tokens travel in URL
 * paths. They are hashed at rest, so the access log must not write them in
 * clear text either: anyone reading `docker compose logs api` (or a snippet
 * pasted in a bug report) would otherwise get working links.
 *
 * Every log line that prints a request URL goes through this helper: the
 * access log, the error handler and the CSRF guard (#612). Case-insensitive,
 * because Express routes `/api/GUEST/<token>` to the guest router too.
 */
const SECRET_PATH_SEGMENT = /(\/(?:guest|reset-password)\/)[^/?#\s]+/gi;

export function redactUrlSecrets(url: string | undefined): string | undefined {
  return url?.replace(SECRET_PATH_SEGMENT, '$1***');
}
