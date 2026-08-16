#!/usr/bin/env node
/**
 * Sends one test email using the SMTP settings in .env, so you can prove email
 * works without placing a fake order.
 *
 * Usage, from the project root:
 *   node scripts/test-email.mjs                 # sends to NOTIFY_EMAIL
 *   node scripts/test-email.mjs you@example.com # sends to a specific address
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadEnvFile();

const {
  SMTP_HOST,
  SMTP_PORT = '587',
  SMTP_SECURE = 'false',
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  NOTIFY_EMAIL,
} = process.env;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error(
    'SMTP is not configured.\n' +
      'Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env, then run this again.\n\n' +
      'Until then the site still takes orders normally — confirmation emails are\n' +
      'written to the log instead of being sent.',
  );
  process.exit(1);
}

const to = process.argv[2] ?? NOTIFY_EMAIL;
if (!to) {
  console.error('No recipient. Set NOTIFY_EMAIL in .env or pass an address as an argument.');
  process.exit(1);
}

const from = SMTP_FROM ?? SMTP_USER;

console.info(`Connecting to ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}…`);

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: ['1', 'true', 'yes', 'on'].includes(SMTP_SECURE.toLowerCase()),
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

try {
  // Checks the connection and credentials before trying to send anything, so a
  // bad password is reported as a bad password rather than a failed send.
  await transporter.verify();
  console.info('Connection and credentials OK.');
} catch (error) {
  console.error(`\nCould not connect or sign in: ${error.message}\n`);
  console.error(
    'Common causes:\n' +
      '  - Gmail needs an App Password, not your normal password:\n' +
      '    https://myaccount.google.com/apppasswords\n' +
      '  - Wrong port: use 587 with SMTP_SECURE=false, or 465 with SMTP_SECURE=true\n' +
      '  - The provider blocks sign-in from a new location — check for a security email',
  );
  process.exit(1);
}

try {
  const info = await transporter.sendMail({
    from,
    to,
    subject: 'HDS Trading OPC — test email',
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="color:#0e7490;margin:0 0 8px">Email is working</h2>
      <p>Your website can now send order confirmations, booking confirmations and
      quotation receipts to customers, and notify your team of new enquiries.</p>
      <p style="font-size:13px;color:#64748b">
        Sent from ${SMTP_HOST} as ${SMTP_USER}.<br>
        From address: ${from}
      </p>
    </div>`,
  });

  console.info(`\nSent to ${to} (message id ${info.messageId}).`);
  console.info(
    '\nCheck the inbox — including spam. If the "From" address is not the one you\n' +
      'set in SMTP_FROM, your provider rewrote it: Gmail does this unless the address\n' +
      'is verified under Settings → Accounts → "Send mail as".',
  );
} catch (error) {
  console.error(`\nConnected, but sending failed: ${error.message}`);
  process.exit(1);
}
