import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// One static token for the single user (ADR 0028). Plain middleware rather
// than a NestJS guard, so the .NET port maps it one to one.

/** Paths that stay open: the health check, so a device can test the address first. */
const OPEN_PATHS = ['/api/v1/health'];

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Refuses requests without `Authorization: Bearer <token>` with a 401 Problem Details. */
export function requireAccessToken(token: string) {
  const expected = digest(token);
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.method === 'OPTIONS' || OPEN_PATHS.includes(request.path)) return next();
    const match = /^Bearer (.+)$/.exec(request.header('authorization') ?? '');
    if (match && timingSafeEqual(digest(match[1]), expected)) return next();
    response
      .status(401)
      .type('application/problem+json')
      .json({ type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'A valid access token is required.' });
  };
}
