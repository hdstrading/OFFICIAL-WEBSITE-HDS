import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env, isProduction } from './env.js';
import { adminUsers, sessions, type AdminRole, type AdminUser } from './db.js';

export const SESSION_COOKIE = 'hds_admin_session';

/* ------------------------------------------------------------------ passwords */

/**
 * Passwords are stored as scrypt hashes, never as passwords.
 *
 * scrypt is deliberately slow and memory-hard, so a stolen database cannot be
 * run through a dictionary at speed. Node ships it, which is why there is no
 * dependency here — one fewer package in the path of every sign-in.
 *
 * The salt is per-password and stored alongside the hash. Two people choosing
 * the same password get different hashes, so cracking one reveals nothing about
 * the other.
 */
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

/**
 * Checks a password against a stored hash in constant time.
 *
 * Comparing the derived keys with `===` would return early on the first wrong
 * byte, which over enough attempts tells an attacker how much of a guess is
 * right. A malformed stored hash fails closed rather than throwing.
 */
export function passwordMatches(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;

  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (expectedBuffer.length !== actual.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuffer);
}

/* ---------------------------------------------------------------- bootstrap */

/**
 * Makes sure there is always someone who can sign in.
 *
 * On a fresh install — or the first boot after this feature landed — the
 * ADMIN_EMAIL and ADMIN_PASSWORD already in the environment become the first
 * super admin. That keeps the existing sign-in working across the upgrade
 * rather than locking staff out of their own site.
 *
 * It runs only when there are no users at all. Once the table is populated the
 * environment stops being the password: changing ADMIN_PASSWORD afterwards does
 * nothing, which is the point — passwords live in the database where they can be
 * changed per person without a deployment. `npm run admin:reset` is the way back
 * in if the super admin password is lost.
 */
export function ensureFirstAdmin(): void {
  if (adminUsers.count() > 0) return;

  adminUsers.create({
    id: crypto.randomUUID(),
    email: env.adminEmail,
    name: 'Super Admin',
    role: 'super_admin',
    active: true,
    passwordHash: hashPassword(env.adminPassword),
  });
  console.info(
    `Created the first staff account: ${env.adminEmail} (super admin), ` +
      'using ADMIN_PASSWORD from the environment. Change it from the staff portal.',
  );
}

/* ------------------------------------------------------------------ sessions */

export function verifyCredentials(email: string, password: string): AdminUser | null {
  const found = adminUsers.credentialsFor(email);

  // A wrong address and a wrong password should cost the same time, or the
  // difference reveals which addresses exist. The dummy hash below is compared
  // against so that a miss still pays for one scrypt.
  if (!found) {
    passwordMatches(password, hashPassword('no-such-user'));
    return null;
  }
  if (!passwordMatches(password, found.passwordHash)) return null;
  // A deactivated account keeps its history but cannot sign in.
  if (!found.active) return null;

  adminUsers.markSignedIn(found.id);
  const { passwordHash: _hash, ...user } = found;
  return user;
}

export function startSession(res: Response, user: AdminUser): number {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + env.sessionTtlMs;
  sessions.create(token, user.email, expiresAt);
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
  admin?: AdminUser;
}

/**
 * Resolves the signed-in user for a request.
 *
 * The session stores an email rather than a role, and the role is read from the
 * user record on every request. That is deliberate: demoting somebody or
 * switching them off takes effect immediately, instead of waiting for a
 * twelve-hour session to expire.
 */
function userForRequest(req: Request): AdminUser | null {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? sessions.find(token) : null;
  if (!session) return null;

  const user = adminUsers.credentialsFor(session.email);
  if (!user || !user.active) return null;
  const { passwordHash: _hash, ...rest } = user;
  return rest;
}

/** Gate for every /api/admin route: signed in, and still an active account. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = userForRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  req.admin = user;
  next();
}

/**
 * Gate for a route only some roles may use.
 *
 * Enforced on the server, where it counts. The staff portal also hides the tabs
 * a role cannot use, but that is presentation — hiding a button has never
 * stopped anybody from calling the endpoint behind it.
 */
export function requireRole(...allowed: AdminRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      res.status(401).json({ error: 'Please sign in to continue.' });
      return;
    }
    if (!allowed.includes(req.admin.role)) {
      res.status(403).json({
        error: 'Your account does not have access to this part of the portal.',
      });
      return;
    }
    next();
  };
}

export function currentAdmin(req: Request): AdminUser | null {
  return userForRequest(req);
}
