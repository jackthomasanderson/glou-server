/** Display only (#950): a 2FA secret split in blocks of 4, so it wraps on a narrow phone. */
export function secretBlocks(secret: string): string[] {
  return secret.match(/.{1,4}/g) ?? [secret];
}
