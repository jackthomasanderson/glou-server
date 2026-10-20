/**
 * ISSUE_490: guest share tokens and password-reset tokens travel in URL
 * paths. They are hashed at rest, so the access log must not write them in
 * clear text either: anyone reading `docker compose logs api` (or a snippet
 * pasted in a bug report) would otherwise get working links.
 */
const SECRET_PATH_SEGMENT = /(\/(?:guest|reset-password)\/)[^/?#\s]+/g;

export function redactUrlSecrets(url: string | undefined): string | undefined {
  return url?.replace(SECRET_PATH_SEGMENT, '$1***');
}
