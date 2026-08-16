#!/usr/bin/env node
/**
 * Sets up the PayMongo webhook, which is what marks orders as paid.
 *
 * Without it, customers can pay successfully and the order stays "unpaid"
 * forever — so this is not optional once you take real money.
 *
 * Usage, from the project root:
 *
 *   node scripts/paymongo-webhook.mjs list      # show existing webhooks
 *   node scripts/paymongo-webhook.mjs create    # create one for this site
 *   node scripts/paymongo-webhook.mjs delete <hook_id>
 *
 * Reads PAYMONGO_SECRET_KEY and SITE_URL from the environment or .env.
 *
 * Test and live mode have separate keys AND separate webhooks, so run `create`
 * once with your sk_test_ key and again after switching to sk_live_.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.paymongo.com/v1';

/** The events the server acts on. See server/src/routes/webhooks.ts. */
const EVENTS = ['checkout_session.payment.paid'];

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

const SECRET_KEY = process.env.PAYMONGO_SECRET_KEY?.trim();
const SITE_URL = (process.env.SITE_URL ?? 'https://hdstradingopc.com').replace(/\/+$/, '');
const WEBHOOK_URL = `${SITE_URL}/api/webhooks/paymongo`;

if (!SECRET_KEY) {
  console.error(
    'PAYMONGO_SECRET_KEY is not set.\n' +
      'Add it to .env (it starts with sk_test_ or sk_live_) and run this again.',
  );
  process.exit(1);
}

const mode = SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST';

async function call(pathname, init = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${SECRET_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.errors?.map((e) => e.detail).join('; ') ?? response.statusText;
    throw new Error(`PayMongo said: ${detail}`);
  }
  return body;
}

async function list() {
  const { data = [] } = await call('/webhooks');
  if (data.length === 0) {
    console.info(`No webhooks configured in ${mode} mode.`);
    return data;
  }
  console.info(`Webhooks in ${mode} mode:\n`);
  for (const hook of data) {
    const { url, events, status } = hook.attributes;
    const mine = url === WEBHOOK_URL ? '  <-- this site' : '';
    console.info(`  ${hook.id}${mine}`);
    console.info(`    url    : ${url}`);
    console.info(`    events : ${events.join(', ')}`);
    console.info(`    status : ${status}\n`);
  }
  return data;
}

async function create() {
  const existing = await call('/webhooks').then(({ data = [] }) => data);
  const already = existing.find((hook) => hook.attributes.url === WEBHOOK_URL);

  if (already) {
    console.info(
      `A webhook for ${WEBHOOK_URL} already exists (${already.id}).\n` +
        'PayMongo only reveals the signing secret when a webhook is created, so if you\n' +
        'no longer have it, delete this one and create a fresh webhook:\n\n' +
        `  node scripts/paymongo-webhook.mjs delete ${already.id}\n` +
        '  node scripts/paymongo-webhook.mjs create\n',
    );
    return;
  }

  if (!SITE_URL.startsWith('https://')) {
    console.error(
      `SITE_URL is "${SITE_URL}". PayMongo only delivers webhooks over HTTPS, so this\n` +
        'must be your real public address before creating the webhook.',
    );
    process.exit(1);
  }

  const { data } = await call('/webhooks', {
    method: 'POST',
    body: JSON.stringify({ data: { attributes: { url: WEBHOOK_URL, events: EVENTS } } }),
  });

  console.info(`\nWebhook created in ${mode} mode.\n`);
  console.info(`  id     : ${data.id}`);
  console.info(`  url    : ${data.attributes.url}`);
  console.info(`  events : ${data.attributes.events.join(', ')}\n`);
  console.info('Add this line to your .env, then restart the server:\n');
  console.info(`  PAYMONGO_WEBHOOK_SECRET=${data.attributes.secret_key}\n`);
  console.info(
    'This secret is shown once and cannot be retrieved later. Without it in .env the\n' +
      'server rejects every webhook and orders never get marked as paid.\n',
  );
}

async function remove(id) {
  if (!id) {
    console.error('Which webhook? Run `list` first, then pass the id.');
    process.exit(1);
  }
  await call(`/webhooks/${id}`, { method: 'DELETE' });
  console.info(`Deleted webhook ${id}.`);
}

const [command, argument] = process.argv.slice(2);

try {
  switch (command) {
    case 'list':
      await list();
      break;
    case 'create':
      await create();
      break;
    case 'delete':
      await remove(argument);
      break;
    default:
      console.info(
        'Usage:\n' +
          '  node scripts/paymongo-webhook.mjs list\n' +
          '  node scripts/paymongo-webhook.mjs create\n' +
          '  node scripts/paymongo-webhook.mjs delete <hook_id>\n',
      );
  }
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}
