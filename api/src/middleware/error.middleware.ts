import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { AppError, PRISMA_ERROR_MAP } from '../lib/errors';
import { redactUrlSecrets } from '../lib/log-redact';

// ─── Global error handler ────────────────────────────────────────────────────
// The one place where a thrown value becomes an HTTP response (design.md,
// "Gestion d'Erreurs / Backend"). Routers are expected to let errors bubble
// (Express 5 forwards a rejected handler promise here automatically) rather
// than assembling their own 500 payload, which used to drop the stack trace
// on the floor and never logged anything (ISSUE_063).
//
// Two invariants:
//   1. The body is always `{ error: <STABLE_CODE> }` — never an exception
//      message, which can carry database/model internals (ISSUE_051).
//   2. The status reflects who is at fault: a malformed body, an oversized
//      upload or a bad query parameter is a 4xx, not a 500 (ISSUE_105).

export interface ClassifiedError {
  status: number;
  code: string;
  details?: unknown;
}

/** Fallback code for a status we have no more specific name for. */
const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

/** `body-parser` tags its failures with a stable `type` string. */
const BODY_PARSER_ERRORS: Record<string, ClassifiedError> = {
  'entity.parse.failed': { status: 400, code: 'MALFORMED_JSON' },
  'entity.verification.failed': { status: 400, code: 'MALFORMED_BODY' },
  'request.aborted': { status: 400, code: 'REQUEST_ABORTED' },
  'request.size.invalid': { status: 400, code: 'INVALID_CONTENT_LENGTH' },
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE' },
  'parameters.too.many': { status: 413, code: 'PAYLOAD_TOO_LARGE' },
  'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_ENCODING' },
  'charset.unsupported': { status: 415, code: 'UNSUPPORTED_CHARSET' },
};

/** Multer limit/field failures. A size overrun is a 413, the rest are 400s. */
const MULTER_ERRORS: Record<string, ClassifiedError> = {
  LIMIT_FILE_SIZE: { status: 413, code: 'FILE_TOO_LARGE' },
  LIMIT_FILE_COUNT: { status: 400, code: 'TOO_MANY_FILES' },
  LIMIT_UNEXPECTED_FILE: { status: 400, code: 'UNEXPECTED_FILE' },
  LIMIT_PART_COUNT: { status: 400, code: 'TOO_MANY_PARTS' },
  LIMIT_FIELD_KEY: { status: 400, code: 'FIELD_NAME_TOO_LONG' },
  LIMIT_FIELD_VALUE: { status: 400, code: 'FIELD_VALUE_TOO_LONG' },
  LIMIT_FIELD_COUNT: { status: 400, code: 'TOO_MANY_FIELDS' },
};

function statusFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : undefined;
}

// How a PostgreSQL outage reaches us through @prisma/adapter-pg (#581): the
// adapter maps only a few socket errors to P1xxx codes; the rest arrive as a
// generic P2039 carrying the PostgreSQL code, as P2037, as the raw socket
// code, or as pg's own "Connection terminated" error.
/** 57P01 admin shutdown, 57P02 crash shutdown, 57P03 starting up, 53300 too many connections. */
const PG_UNAVAILABLE_CODES = new Set(['57P01', '57P02', '57P03', '53300']);
const SOCKET_UNAVAILABLE_CODES = new Set(['EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE']);

function postgresCodeOf(err: Prisma.PrismaClientKnownRequestError): string | undefined {
  const adapterError = (err.meta as { driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined)
    ?.driverAdapterError;
  const fromMeta = adapterError?.cause?.originalCode;
  if (typeof fromMeta === 'string') return fromMeta;
  // P2039 message: "Database error. Code: `57P03`. Message: `...`".
  return /Code: `([0-9A-Z]{5})`/.exec(err.message)?.[1];
}

/** True when the database is down or restarting: a 503, never a 4xx or a sign-out. */
export function isDatabaseUnavailable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code.startsWith('P1') || err.code === 'P2037') return true;
    if (SOCKET_UNAVAILABLE_CODES.has(err.code)) return true;
    const pgCode = postgresCodeOf(err);
    return pgCode !== undefined && PG_UNAVAILABLE_CODES.has(pgCode);
  }
  if (!(err instanceof Error)) return false;
  if (err.name === 'PrismaClientInitializationError') return true;
  return err.message.includes('Connection terminated');
}

/**
 * Map an unknown thrown value onto an HTTP status and a stable error code.
 * Exported so the mapping can be unit-tested without spinning up the app.
 */
export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, details: err.details };
  }

  if (err instanceof ZodError) {
    return { status: 400, code: 'VALIDATION_ERROR', details: err.format() };
  }

  if (err instanceof multer.MulterError) {
    return MULTER_ERRORS[err.code] ?? { status: 400, code: 'UPLOAD_REJECTED' };
  }

  if (isDatabaseUnavailable(err)) {
    return { status: 503, code: 'DATABASE_UNAVAILABLE' };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return PRISMA_ERROR_MAP[err.code] ?? { status: 500, code: 'UNEXPECTED_ERROR' };
  }

  if (typeof err === 'object' && err !== null) {
    const candidate = err as { type?: unknown; status?: unknown; statusCode?: unknown };

    if (typeof candidate.type === 'string' && BODY_PARSER_ERRORS[candidate.type]) {
      return BODY_PARSER_ERRORS[candidate.type];
    }

    // Anything else that carries an explicit HTTP status (http-errors style).
    const status = statusFrom(candidate.status) ?? statusFrom(candidate.statusCode);
    if (status !== undefined) {
      return { status, code: STATUS_CODES[status] ?? (status < 500 ? 'BAD_REQUEST' : 'UNEXPECTED_ERROR') };
    }
  }

  return { status: 500, code: 'UNEXPECTED_ERROR' };
}

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { status, code, details } = classifyError(err);
  // Guest share links carry their token in the path: never log it (#612).
  const where = `${req.method} ${redactUrlSecrets(req.originalUrl)}`;

  // Server-side failures keep the full error (message, stack, cause) in the
  // container logs; client-side ones are noted without the stack so a bad
  // request cannot be used to flood the journal.
  //
  // `where` is request-controlled, so it is passed as an argument of a constant
  // format string rather than interpolated into one: a URL containing `%s` or
  // `%d` would otherwise be read as a placeholder by console's own formatting
  // and consume the `err` argument, dropping the stack from the log line.
  if (status >= 500) {
    console.error('[error] %s -> %d %s', where, status, code, err);
  } else {
    console.warn('[error] %s -> %d %s', where, status, code);
  }

  // Streaming responses (file download/export) may already have been started;
  // Express's default handler is the only thing that can close those cleanly.
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(status).json(details === undefined ? { error: code } : { error: code, details });
}
