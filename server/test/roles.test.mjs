/**
 * Three staff roles, and the walls between them.
 *
 * The portal hides the tabs a role cannot use, but hiding a button has never
 * stopped anybody from calling the endpoint behind it. These checks go straight
 * at the API with a real session cookie, which is what an unhappy employee with
 * the browser's network tab open would do.
 *
 * Run:  node server/test/roles.test.mjs
 */

process.env.DATABASE_FILE = process.argv[2] ?? '/tmp/hds-roles-test.db';
process.env.ADMIN_EMAIL = 'owner@example.com';
process.env.ADMIN_PASSWORD = 'first-owner-password';
process.env.SESSION_SECRET = 'test-session-secret-value';
process.env.PORT = '4599';
process.env.HOST = '127.0.0.1';
process.env.SMTP_HOST = '';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${process.env.DATABASE_FILE}${suffix}`, { force: true });
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dist = (file) => new URL(path.join(HERE, '..', 'dist', file), 'file://').href;

await import(dist('index.js'));
// The server binds asynchronously; a short wait is cheaper than a health-check loop.
await new Promise((resolve) => setTimeout(resolve, 700));

const BASE = `http://127.0.0.1:${process.env.PORT}`;

let pass = 0;
let total = 0;
const check = (label, ok, detail = '') => {
  total++;
  if (ok) pass++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

/** Signs in and returns a fetch bound to that person's cookie. */
async function signIn(email, password) {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const call = (method, url, payload) =>
    fetch(`${BASE}${url}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  return { ok: res.ok, status: res.status, body, call };
}

/* -------------------------------------------------- the environment bootstraps */

const owner = await signIn('owner@example.com', 'first-owner-password');
check('the environment password creates the first super admin', owner.ok, `status=${owner.status}`);
check('and sign-in reports the role', owner.body.role === 'super_admin', `role=${owner.body.role}`);

check(
  'a wrong password is refused',
  (await signIn('owner@example.com', 'not-the-password')).status === 401,
);

/* --------------------------------------------------------- creating colleagues */

const madeStock = await owner.call('POST', '/api/admin/users', {
  email: 'stock@example.com',
  name: 'Stock Keeper',
  role: 'inventory_manager',
  password: 'warehouse-keys-2026',
});
check('a super admin can create an inventory manager', madeStock.status === 201, `status=${madeStock.status}`);

const madeWeb = await owner.call('POST', '/api/admin/users', {
  email: 'web@example.com',
  name: 'Web Editor',
  role: 'website_admin',
  password: 'writes-the-website-2026',
});
check('and a website administrator', madeWeb.status === 201, `status=${madeWeb.status}`);

const shortPassword = await owner.call('POST', '/api/admin/users', {
  email: 'weak@example.com',
  name: 'Weak',
  role: 'website_admin',
  password: 'short',
});
check('a five-character password is refused', shortPassword.status === 400);

const duplicate = await owner.call('POST', '/api/admin/users', {
  email: 'STOCK@example.com',
  name: 'Impostor',
  role: 'super_admin',
  password: 'trying-to-take-over-2026',
});
check('the same address in different case cannot be registered twice', duplicate.status === 409);

/* -------------------------------------------------------------- the boundaries */

const stock = await signIn('stock@example.com', 'warehouse-keys-2026');
const web = await signIn('web@example.com', 'writes-the-website-2026');
check('the inventory manager can sign in', stock.ok && stock.body.role === 'inventory_manager');
check('the website administrator can sign in', web.ok && web.body.role === 'website_admin');

check('the inventory manager reaches orders', (await stock.call('GET', '/api/admin/orders')).status === 200);
check('but not the services the website sells', (await stock.call('GET', '/api/admin/services')).status === 403);
check('and not the staff accounts', (await stock.call('GET', '/api/admin/users')).status === 403);
check('and not the company details', (await stock.call('GET', '/api/admin/settings/company')).status === 403);

check('the website administrator reaches posts', (await web.call('GET', '/api/admin/posts')).status === 200);
check('but not the order book', (await web.call('GET', '/api/admin/orders')).status === 403);
check('and cannot create accounts', (
  await web.call('POST', '/api/admin/users', {
    email: 'promoted@example.com', name: 'Me Again', role: 'super_admin', password: 'promoting-myself-2026',
  })
).status === 403);

check('the super admin reaches all three', (
  await Promise.all([
    owner.call('GET', '/api/admin/orders'),
    owner.call('GET', '/api/admin/posts'),
    owner.call('GET', '/api/admin/users'),
  ])
).every((r) => r.status === 200));

check('signed out, nothing is reachable', (await fetch(`${BASE}/api/admin/orders`)).status === 401);

/* ------------------------------------------------- the last super admin is kept */

const users = await (await owner.call('GET', '/api/admin/users')).json();
const ownerRow = users.users.find((u) => u.email === 'owner@example.com');

const selfDemote = await owner.call('PATCH', `/api/admin/users/${ownerRow.id}`, {
  email: 'owner@example.com',
  name: 'Super Admin',
  role: 'website_admin',
});
check('the only super admin cannot demote themselves', selfDemote.status === 409, `status=${selfDemote.status}`);

const selfDelete = await owner.call('DELETE', `/api/admin/users/${ownerRow.id}`);
check('nor delete the account they are signed in with', selfDelete.status === 409);

/* --------------------------------- a demoted colleague loses access immediately */

const stockRow = users.users.find((u) => u.email === 'stock@example.com');
await owner.call('PATCH', `/api/admin/users/${stockRow.id}`, {
  email: 'stock@example.com',
  name: 'Stock Keeper',
  role: 'website_admin',
});
check(
  'a role change applies to the session already open, not at the next sign-in',
  (await stock.call('GET', '/api/admin/orders')).status === 403,
);

await owner.call('PATCH', `/api/admin/users/${stockRow.id}`, {
  email: 'stock@example.com',
  name: 'Stock Keeper',
  role: 'website_admin',
  active: false,
});
check(
  'switching an account off ends the session it is holding',
  (await stock.call('GET', '/api/admin/posts')).status === 401,
);
check(
  'and a deactivated account cannot sign back in',
  (await signIn('stock@example.com', 'warehouse-keys-2026')).status === 401,
);

/* ------------------------------------------------------------ changing your own */

const wrongCurrent = await web.call('POST', '/api/admin/me/password', {
  currentPassword: 'guessing',
  password: 'a-brand-new-password-2026',
});
check('changing your password needs the current one', wrongCurrent.status === 401);

const changed = await web.call('POST', '/api/admin/me/password', {
  currentPassword: 'writes-the-website-2026',
  password: 'a-brand-new-password-2026',
});
check('with the current one it works', changed.status === 200, `status=${changed.status}`);
check('the old password stops working', (await signIn('web@example.com', 'writes-the-website-2026')).status === 401);
check('the new one works', (await signIn('web@example.com', 'a-brand-new-password-2026')).ok);

/* ------------------------------------------------- guessing at one account */

/**
 * The per-address limit stops one machine hammering the portal. This is the
 * other half: many machines each trying one password against a known email.
 * It matters more now the portal lives at a memorable address.
 */
const VICTIM = 'locked@example.com';
await owner.call('POST', '/api/admin/users', {
  email: VICTIM,
  name: 'Target',
  role: 'website_admin',
  password: 'the-real-password-2026',
});

// Each attempt comes from a different forwarded address, so only the
// per-account counter can stop them.
let lockedAt = 0;
for (let attempt = 1; attempt <= 12; attempt++) {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${attempt}` },
    body: JSON.stringify({ email: VICTIM, password: `guess-number-${attempt}` }),
  });
  if (res.status === 429 && !lockedAt) lockedAt = attempt;
}
check('repeated guesses at one account are cut off', lockedAt > 0, `locked on attempt ${lockedAt}`);
check('and the correct password is refused while locked', (await signIn(VICTIM, 'the-real-password-2026')).status === 429);
check(
  'while a different account is unaffected',
  (await signIn('web@example.com', 'a-brand-new-password-2026')).ok,
);

console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
