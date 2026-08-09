import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env, isProduction } from './env.js';
import { sessions } from './db.js';

export const SESSION_COOKIE = 'hds_admin_session';

/**
 * Constant-time comparison so a wrong password cannot be discovered by timing
 * how long the check takes.
 */
function safeEquals(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function verifyCredentials(email: string, password: string): boolean {
  const emailOk = safeEquals(email.trim().toLowerCase(), env.adminEmail.trim().toLowerCase());
  const passwordOk = safeEquals(password, env.adminPassword);
  // Evaluate both before returning so the result does not leak which one failed.
  return emailOk && passwordOk;
}

export function startSession(res: Response, email: string): number {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + env.sessionTtlMs;
  sessions.create(token, email, expiresAt);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: env.sessionCookieSameSite,
    // SameSite=None is only honoured on a secure cookie, so force it on even
    // in development if someone configures cross-domain hosting.
    secure: isProduction || env.sessionCookieSameSite === 'none',
    maxAge: env.sessionTtlMs,
    path: '/',
  });
  return expiresAt;
}

export function endSession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) sessions.remove(token);
  // The attributes must match the ones the cookie was set with, or the browser
  // keeps it and the staff member appears to stay signed in.
  res.clearCookie(SESSION_COOKIE, {
    path: '/',
    sameSite: env.sessionCookieSameSite,
    secure: isProduction || env.sessionCookieSameSite === 'none',
  });
}

export interface AuthedRequest extends Request {
  adminEmail?: string;
}

/** Gate for every /api/admin route. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? sessions.find(token) : null;
  if (!session) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  req.adminEmail = session.email;
  next();
}

export function currentAdmin(req: Request): string | null {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? sessions.find(token) : null;
  return session?.email ?? null;
}
