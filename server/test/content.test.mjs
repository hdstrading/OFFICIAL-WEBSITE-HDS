/**
 * Company details and posts — the parts staff edit without a developer.
 *
 * Two things matter here. A draft must never be reachable from the public site,
 * because "we'll publish it Monday" has to actually mean that. And clearing a
 * field in the settings form must restore the default rather than leave a blank
 * space where the phone number used to be.
 *
 * Run:  node server/test/content.test.mjs
 */

process.env.DATABASE_FILE = process.argv[2] ?? '/tmp/hds-content-test.db';
process.env.ADMIN_EMAIL = 'owner@example.com';
process.env.ADMIN_PASSWORD = 'first-owner-password';
process.env.SESSION_SECRET = 'test-session-secret-value';
process.env.PORT = '4598';
process.env.HOST = '127.0.0.1';
process.env.SMTP_HOST = '';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${process.env.DATABASE_FILE}${suffix}`, { force: true });
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
await import(new URL(path.join(HERE, '..', 'dist', 'index.js'), 'file://').href);
await new Promise((resolve) => setTimeout(resolve, 700));

const BASE = `http://127.0.0.1:${process.env.PORT}`;

let pass = 0;
let total = 0;
const check = (label, ok, detail = '') => {
  total++;
  if (ok) pass++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
};

const login = await fetch(`${BASE}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'owner@example.com', password: 'first-owner-password' }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const call = (method, url, payload) =>
  fetch(`${BASE}${url}`, {
    method,
    headers: { cookie, 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
const publicGet = (url) => fetch(`${BASE}${url}`).then((r) => r.json());

/* ------------------------------------------------------------- company details */

const before = await publicGet('/api/site-info');
check(
  'the site shows the real details before anything is saved',
  before.company.hotlines[0]?.numbers.includes('0917 163 7359'),
  JSON.stringify(before.company.hotlines[0]),
);
check('and the branch names come through', before.company.hotlines[1]?.branch === 'Taguig');
check('office hours are there', before.company.hours.label.includes('Monday'));
check('sales addresses are a list, not one blob', before.company.email.sales.length === 3);

const saved = await call('PUT', '/api/admin/settings/company', {
  hoursLabel: 'Monday – Friday, 9:00 AM – 5:00 PM',
  hotlines: 'Taytay: 0917 000 1111\nCebu: 0917 222 3333, 0917 444 5555',
  emailPrimary: 'hello@hdstradingopc.com',
  deliveryFreeThreshold: 7500,
});
check('the super admin can save company details', saved.status === 200, `status=${saved.status}`);

const after = await publicGet('/api/site-info');
check('the new hours reach the public site', after.company.hours.label.includes('Friday'));
check('a rewritten hotline list replaces the old one', after.company.hotlines.length === 2);
check('with its numbers split out', after.company.hotlines[1].numbers.length === 2);
check(
  'the free delivery threshold moves with it',
  after.freeDeliveryThreshold === 7500,
  `threshold=${after.freeDeliveryThreshold}`,
);
check(
  'and untouched fields keep their values',
  after.company.office.full === before.company.office.full,
);

await call('PUT', '/api/admin/settings/company', { hoursLabel: '' });
const cleared = await publicGet('/api/site-info');
check(
  'clearing a field restores the default rather than leaving it blank',
  cleared.company.hours.label.includes('Monday – Saturday'),
  `label=${cleared.company.hours.label}`,
);

const badThreshold = await call('PUT', '/api/admin/settings/company', { deliveryFreeThreshold: -100 });
check('a negative delivery threshold is refused', badThreshold.status === 400);

/* --------------------------------------------------------------------- posts */

const announcement = await call('POST', '/api/admin/posts', {
  type: 'announcement',
  title: 'Holiday Delivery Schedule 2026',
  summary: 'When we deliver over the holidays.',
  body: 'Deliveries pause on the 25th and resume on the 27th.',
  published: true,
});
check('a published announcement is created', announcement.status === 201, `status=${announcement.status}`);
const announcementBody = await announcement.json();
check(
  'the web address is made from the title',
  announcementBody.post.slug === 'holiday-delivery-schedule-2026',
  announcementBody.post.slug,
);

const draft = await call('POST', '/api/admin/posts', {
  type: 'article',
  title: 'Draft: Pool Chemistry Basics',
  body: 'Not finished yet.',
  published: false,
});
const draftBody = await draft.json();
check('a draft is saved', draft.status === 201);

const list = await publicGet('/api/posts');
check('the public list shows the published post', list.posts.some((p) => p.slug === announcementBody.post.slug));
check('and hides the draft', !list.posts.some((p) => p.slug === draftBody.post.slug));

const draftPage = await fetch(`${BASE}/api/posts/${draftBody.post.slug}`);
check('a draft read directly answers as missing', draftPage.status === 404);

const clash = await call('POST', '/api/admin/posts', {
  type: 'announcement',
  title: 'Holiday Delivery Schedule 2026',
  body: 'A second one by mistake.',
  published: true,
});
check('two posts cannot share a web address', clash.status === 409);

const videoWithoutVideo = await call('POST', '/api/admin/posts', {
  type: 'video',
  title: 'How To Dose A Pool',
  body: 'The link is missing.',
  published: true,
});
check('a video post with no video link is refused', videoWithoutVideo.status === 400);

const faq = await call('POST', '/api/admin/posts', {
  type: 'faq',
  title: 'Do you deliver to Tacloban?',
  body: 'Yes — we have a branch there with its own hotline.',
  published: true,
});
check('an FAQ is created', faq.status === 201);
const faqOnly = await publicGet('/api/posts?type=faq');
check('and filtering by type returns only FAQs', faqOnly.posts.length === 1 && faqOnly.posts[0].type === 'faq');

const sitemap = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
check('the published announcement is in the sitemap', sitemap.includes('/resources/holiday-delivery-schedule-2026'));
check('the draft is not', !sitemap.includes(draftBody.post.slug));

const published = await call('PUT', `/api/admin/posts/${draftBody.post.id}`, {
  type: 'article',
  title: 'Pool Chemistry Basics',
  body: 'Finished now.',
  published: true,
});
check('publishing a draft works', published.status === 200, `status=${published.status}`);
check(
  'and it appears publicly',
  (await publicGet('/api/posts')).posts.some((p) => p.title === 'Pool Chemistry Basics'),
);

const removed = await call('DELETE', `/api/admin/posts/${draftBody.post.id}`);
check('a post can be deleted', removed.status === 200);
check(
  'and stops being served',
  !(await publicGet('/api/posts')).posts.some((p) => p.title === 'Pool Chemistry Basics'),
);

console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
