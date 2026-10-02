import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

import { classifyError, errorMiddleware } from '../../src/middleware/error.middleware';
import { AppError } from '../../src/lib/errors';

/** Minimal body-parser-shaped failure: what express.json() actually emits. */
function bodyParserError(type: string, status: number): Error & { type: string; status: number } {
  return Object.assign(new Error('internal body-parser detail'), { type, status });
}

function prismaKnownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('internal prisma detail', {
    code,
    clientVersion: '7.0.0',
  });
}

describe('classifyError', () => {
  it('honours the status and code carried by an AppError', () => {
    expect(classifyError(new AppError(413, 'FILE_TOO_LARGE'))).toEqual({
      status: 413,
      code: 'FILE_TOO_LARGE',
      details: undefined,
    });
  });

  it('turns a ZodError into a 400 VALIDATION_ERROR with details', () => {
    const parsed = z.object({ page: z.number() }).safeParse({ page: 'abc' });
    expect(parsed.success).toBe(false);
    const result = classifyError(parsed.success ? null : parsed.error);
    expect(result.status).toBe(400);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(result.details).toBeDefined();
  });

  it('maps a malformed JSON body to 400 and an oversized one to 413', () => {
    expect(classifyError(bodyParserError('entity.parse.failed', 400))).toEqual({
      status: 400,
      code: 'MALFORMED_JSON',
    });
    expect(classifyError(bodyParserError('entity.too.large', 413))).toEqual({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('maps multer limits to 413 for size and 400 for everything else', () => {
    expect(classifyError(new multer.MulterError('LIMIT_FILE_SIZE'))).toEqual({
      status: 413,
      code: 'FILE_TOO_LARGE',
    });
    expect(classifyError(new multer.MulterError('LIMIT_UNEXPECTED_FILE'))).toEqual({
      status: 400,
      code: 'UNEXPECTED_FILE',
    });
  });

  it('maps the Prisma codes with an unambiguous client meaning', () => {
    expect(classifyError(prismaKnownError('P2025'))).toEqual({ status: 404, code: 'NOT_FOUND' });
    expect(classifyError(prismaKnownError('P2002'))).toEqual({ status: 409, code: 'ALREADY_EXISTS' });
  });

  it('reports an unreachable database as 503, never as "not found"', () => {
    expect(classifyError(prismaKnownError('P1001'))).toEqual({
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
    });
    const initError = Object.assign(new Error('boom'), { name: 'PrismaClientInitializationError' });
    expect(classifyError(initError)).toEqual({ status: 503, code: 'DATABASE_UNAVAILABLE' });
  });

  it('keeps an unknown Prisma failure a 500 rather than guessing a 4xx', () => {
    expect(classifyError(prismaKnownError('P2026'))).toEqual({
      status: 500,
      code: 'UNEXPECTED_ERROR',
    });
  });

  it('picks up an http-errors style status from either property name', () => {
    expect(classifyError(Object.assign(new Error('x'), { status: 409 }))).toEqual({
      status: 409,
      code: 'CONFLICT',
    });
    expect(classifyError(Object.assign(new Error('x'), { statusCode: 429 }))).toEqual({
      status: 429,
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('falls back to 500 UNEXPECTED_ERROR for anything else', () => {
    expect(classifyError(new Error('kaboom'))).toEqual({ status: 500, code: 'UNEXPECTED_ERROR' });
    expect(classifyError('a string')).toEqual({ status: 500, code: 'UNEXPECTED_ERROR' });
    expect(classifyError(undefined)).toEqual({ status: 500, code: 'UNEXPECTED_ERROR' });
  });
});

describe('errorMiddleware', () => {
  const req = { method: 'GET', originalUrl: '/api/tastings' } as Request;
  let status: ReturnType<typeof vi.fn>;
  let json: ReturnType<typeof vi.fn>;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    json = vi.fn();
    status = vi.fn(() => ({ json })) as never;
    res = { status, headersSent: false } as unknown as Response;
    next = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs a server failure and answers a generic code — never the message', () => {
    errorMiddleware(new Error('relation "User" does not exist'), req, res, next);

    expect(console.error).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ error: 'UNEXPECTED_ERROR' });
    expect(JSON.stringify(json.mock.calls)).not.toContain('relation');
  });

  it('logs a client mistake as a warning and answers its mapped status', () => {
    errorMiddleware(new AppError(400, 'MALFORMED_JSON'), req, res, next);

    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'MALFORMED_JSON' });
  });

  it('includes details only when the error carries them', () => {
    errorMiddleware(new AppError(400, 'VALIDATION_ERROR', { details: { page: ['bad'] } }), req, res, next);
    expect(json).toHaveBeenCalledWith({ error: 'VALIDATION_ERROR', details: { page: ['bad'] } });
  });

  it('delegates to Express when the response has already started', () => {
    const started = { status, headersSent: true } as unknown as Response;
    const err = new Error('stream died');
    errorMiddleware(err, req, started, next);

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(err);
  });
});
