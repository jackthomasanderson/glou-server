import { Prisma } from '@prisma/client';

/**
 * Typed application error — the single way route and service code declares an
 * HTTP contract for a failure.
 *
 * `design.md` ("Gestion d'Erreurs / Backend : middleware global d'erreur,
 * exceptions typées") asks for exactly one place that turns a thrown value
 * into a response. Throwing an `AppError` (or simply letting any error bubble
 * up — Express 5 forwards rejected handler promises to the error middleware
 * on its own) is therefore always preferred over building a 500 response by
 * hand inside a `catch` block: the latter loses the stack trace and skips the
 * centralised logging in `error.middleware.ts`.
 */
export class AppError extends Error {
  readonly status: number;
  /** Stable, client-facing error code (SCREAMING_SNAKE_CASE). Never a free-form message. */
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    options: { details?: unknown; cause?: unknown } = {},
  ) {
    super(code, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
  }
}

export const badRequest = (code = 'BAD_REQUEST', details?: unknown): AppError =>
  new AppError(400, code, { details });
export const unauthorized = (code = 'UNAUTHORIZED'): AppError => new AppError(401, code);
export const forbidden = (code = 'FORBIDDEN'): AppError => new AppError(403, code);
export const notFound = (code = 'NOT_FOUND'): AppError => new AppError(404, code);
export const conflict = (code = 'CONFLICT'): AppError => new AppError(409, code);

/**
 * Prisma "record required but not found" (`P2025`) — the only Prisma failure
 * that legitimately means "this row does not exist". Any other failure of an
 * `update`/`delete` (database unreachable, constraint violation, invalid
 * value) must keep bubbling up instead of being reported as a 404, otherwise
 * an outage reads to the user as a deleted record (ISSUE_107).
 */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/**
 * Prisma error code → HTTP contract. Only codes with an unambiguous client
 * meaning are listed; everything else stays a 500 so an internal failure is
 * never dressed up as a client mistake.
 */
export const PRISMA_ERROR_MAP: Record<string, { status: number; code: string }> = {
  P2000: { status: 400, code: 'VALUE_TOO_LONG' },
  P2001: { status: 404, code: 'NOT_FOUND' },
  P2002: { status: 409, code: 'ALREADY_EXISTS' },
  P2003: { status: 409, code: 'CONSTRAINT_VIOLATION' },
  P2014: { status: 409, code: 'CONSTRAINT_VIOLATION' },
  P2025: { status: 404, code: 'NOT_FOUND' },
};
