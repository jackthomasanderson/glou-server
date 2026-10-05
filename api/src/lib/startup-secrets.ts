// Secrets the API cannot work without. `.env.example` ships public
// placeholders for both, and compose passes a missing variable through as an
// empty string — a NAS UI (Synology Container Manager, Portainer...) that
// never loaded the `.env` file therefore boots a "healthy" API that fails on
// the first sign-in: `signToken` throws JWT_SECRET_NOT_SET after the first
// account row has been written (ISSUE #247).

export const PLACEHOLDER_JWT_SECRET =
  'change_me_with_a_strong_random_secret_of_at_least_64_chars_long_xxxxxxxxxxx';
export const PLACEHOLDER_CONFIG_ENCRYPTION_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000';

export interface SecretProblem {
  name: 'JWT_SECRET' | 'CONFIG_ENCRYPTION_KEY';
  reason: 'missing' | 'placeholder' | 'invalid';
}

export function findSecretProblems(env: NodeJS.ProcessEnv): SecretProblem[] {
  const problems: SecretProblem[] = [];

  const jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret) problems.push({ name: 'JWT_SECRET', reason: 'missing' });
  else if (jwtSecret === PLACEHOLDER_JWT_SECRET) problems.push({ name: 'JWT_SECRET', reason: 'placeholder' });

  const encryptionKey = env.CONFIG_ENCRYPTION_KEY?.trim();
  if (!encryptionKey) problems.push({ name: 'CONFIG_ENCRYPTION_KEY', reason: 'missing' });
  else if (encryptionKey === PLACEHOLDER_CONFIG_ENCRYPTION_KEY) {
    problems.push({ name: 'CONFIG_ENCRYPTION_KEY', reason: 'placeholder' });
  } else if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
    problems.push({ name: 'CONFIG_ENCRYPTION_KEY', reason: 'invalid' });
  }

  return problems;
}

const HINTS: Record<SecretProblem['name'], string> = {
  JWT_SECRET: 'generate one with `openssl rand -base64 48`',
  CONFIG_ENCRYPTION_KEY: 'must be 64 hex characters, generate one with `openssl rand -hex 32`',
};

const REASONS: Record<SecretProblem['reason'], string> = {
  missing: 'is not set (or empty)',
  placeholder: 'still has its .env.example placeholder value',
  invalid: 'is malformed',
};

export function describeSecretProblem({ name, reason }: SecretProblem): string {
  return `${name} ${REASONS[reason]} — ${HINTS[name]}. See docs/wiki/EN/01-Installation.md (FR: docs/wiki/FR/01-Installation.md).`;
}
