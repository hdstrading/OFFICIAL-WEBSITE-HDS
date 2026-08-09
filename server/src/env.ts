import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Repo root, whether we are running from `src/` (tsx) or `dist/` (node). */
export const ROOT = path.resolve(here, '..', '..');

const bool = (value: string | undefined, fallback = false) =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * A missing admin password is a configuration error in production — we refuse to
 * boot rather than quietly leave the admin panel wide open. In development we
 * generate a throwaway one and print it.
 */
function resolveAdminPassword(): string {
  const configured = process.env.ADMIN_PASSWORD?.trim();
  if (configured) return configured;
  if (isProduction) {
    throw new Error(
      'ADMIN_PASSWORD is not set. Set it in your environment before starting the server in production.',
    );
  }
  const generated = crypto.randomBytes(9).toString('base64url');
  console.warn(
    `\n  ADMIN_PASSWORD is not set. Using a temporary development password: ${generated}\n` +
      '  Set ADMIN_PASSWORD in your .env file to keep it stable.\n',
  );
  return generated;
}

function resolveSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  if (isProduction) {
    throw new Error('SESSION_SECRET is not set. Generate one with: openssl rand -hex 32');
  }
  return crypto.randomBytes(32).toString('hex');
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  siteUrl: (process.env.SITE_URL ?? 'https://hdstradingopc.com').replace(/\/$/, ''),
  databaseFile: process.env.DATABASE_FILE ?? path.join(ROOT, 'server', 'data', 'hds.db'),
  clientDist: process.env.CLIENT_DIST ?? path.join(ROOT, 'client', 'dist'),

  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@hdstradingopc.com',
  adminPassword: resolveAdminPassword(),
  sessionSecret: resolveSessionSecret(),
  /** How long an admin stays signed in. */
  sessionTtlMs: Number(process.env.SESSION_TTL_HOURS ?? 12) * 60 * 60 * 1000,

  /** Where new enquiries are emailed. Falls back to the public sales inbox. */
  notifyEmail: process.env.NOTIFY_EMAIL ?? 'hanepditoshop@gmail.com',

  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'HDS Trading OPC <no-reply@hdstradingopc.com>',
  },

  /**
   * The admin panel lives at an unguessable path so it is not discoverable by
   * browsing. It is never linked from the site and never listed in the sitemap.
   */
  adminPath: (process.env.ADMIN_PATH ?? 'staff-portal-9f3c').replace(/^\/+|\/+$/g, ''),

  /** PayMongo — cards, GCash, Maya and online bank transfer. */
  paymongo: {
    secretKey: process.env.PAYMONGO_SECRET_KEY ?? '',
    publicKey: process.env.PAYMONGO_PUBLIC_KEY ?? '',
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET ?? '',
  },

  /** Percentage of a service booking taken up front as a down payment. */
  bookingDepositPercent: Math.min(
    100,
    Math.max(0, Number(process.env.BOOKING_DEPOSIT_PERCENT ?? 30)),
  ),

  /** Where our own vehicles start from, used as the courier pickup point. */
  warehouse: {
    address: process.env.WAREHOUSE_ADDRESS ?? 'Taytay, Rizal, Philippines',
    lat: Number(process.env.WAREHOUSE_LAT ?? 14.5578),
    lng: Number(process.env.WAREHOUSE_LNG ?? 121.1327),
    contactName: process.env.WAREHOUSE_CONTACT_NAME ?? 'HDS Trading Dispatch',
    contactPhone: process.env.WAREHOUSE_CONTACT_PHONE ?? '+639171637359',
  },

  lalamove: {
    apiKey: process.env.LALAMOVE_API_KEY ?? '',
    apiSecret: process.env.LALAMOVE_API_SECRET ?? '',
    market: process.env.LALAMOVE_MARKET ?? 'PH',
    /** Sandbox by default so nobody books a real rider by accident. */
    baseUrl: process.env.LALAMOVE_BASE_URL ?? 'https://rest.sandbox.lalamove.com',
  },

  transportify: {
    apiKey: process.env.TRANSPORTIFY_API_KEY ?? '',
    baseUrl: process.env.TRANSPORTIFY_BASE_URL ?? 'https://api.transportify.com.ph',
  },

  /** Booking capacity: how many crews can be dispatched per time slot per day. */
  booking: {
    slotCapacity: Number(process.env.BOOKING_SLOT_CAPACITY ?? 2),
    /** How far ahead customers may book. */
    horizonDays: Number(process.env.BOOKING_HORIZON_DAYS ?? 90),
    /** Same-day bookings need a phone call, so require this much notice. */
    leadTimeDays: Number(process.env.BOOKING_LEAD_TIME_DAYS ?? 1),
  },

  zoho: {
    enabled: bool(process.env.ZOHO_SYNC_ENABLED, false),
    clientId: process.env.ZOHO_CLIENT_ID ?? '',
    clientSecret: process.env.ZOHO_CLIENT_SECRET ?? '',
    refreshToken: process.env.ZOHO_REFRESH_TOKEN ?? '',
    organizationId: process.env.ZOHO_ORGANIZATION_ID ?? '',
    region: process.env.ZOHO_REGION ?? 'com',
  },

  /** Extra origins allowed to call the API (the client is same-origin in production). */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
} as const;

export const smtpConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.pass);

/** Online card/e-wallet payments are only offered when the gateway has keys. */
export const paymentsConfigured = Boolean(env.paymongo.secretKey);

export const lalamoveConfigured = Boolean(env.lalamove.apiKey && env.lalamove.apiSecret);
export const transportifyConfigured = Boolean(env.transportify.apiKey);
