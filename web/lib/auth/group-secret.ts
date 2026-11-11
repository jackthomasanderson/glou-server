/** Display only (#950): a 2FA secret in blocks of 4, so it wraps on a narrow phone. Copy the raw value. */
export function groupSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}
