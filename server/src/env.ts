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

  /**
   * Network interface to listen on.
   *
   * Defaults to loopback only: nginx proxies from the same machine, so the
   * application never needs to be reachable from outside. Binding to 0.0.0.0
   * would expose it on its port directly — bypassing TLS, the security headers
   * and the rate limiting that nginx applies.
   *
   * Set HOST=0.0.0.0 only if you are running without a reverse proxy, and put a
   * firewall in front of it if you do.
   */
  host: process.env.HOST ?? '127.0.0.1',
  siteUrl: (process.env.SITE_URL ?? 'https://hdstradingopc.com').replace(/\/$/, ''),
  databaseFile: process.env.DATABASE_FILE ?? path.join(ROOT, 'server', 'data', 'hds.db'),
  clientDist: process.env.CLIENT_DIST ?? path.join(ROOT, 'client', 'dist'),

  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@hdstradingopc.com',
  adminPassword: resolveAdminPassword(),
  sessionSecret: resolveSessionSecret(),
  /** How long an admin stays signed in. */
  sessionTtlMs: Number(process.env.SESSION_TTL_HOURS ?? 12) * 60 * 60 * 1000,

  /**
   * SameSite policy for the admin session cookie.
   *
   * `lax` is correct for the single-server setup and for split hosting on a
   * subdomain (api.hdstradingopc.com and hdstradingopc.com are cross-origin but
   * same-site, so the cookie is still sent).
   *
   * Only set this to `none` if the API lives on a genuinely different domain.
   * That makes it a third-party cookie, which Safari blocks outright and Chrome
   * is phasing out — so prefer the subdomain.
   */
  sessionCookieSameSite: (process.env.SESSION_COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none',

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

  /**
   * Payment processing fee, as a percentage of the amount payable, per method.
   *
   * PayMongo charges us on every transaction and the rate depends on how the
   * customer paid — cards and online banking cost the most, e-wallets less.
   * Rather than average it into shelf prices, where every customer would pay for
   * the most expensive method, it is charged to the method that incurs it.
   *
   * Bank deposit and cash on delivery are zero and should stay zero: they never
   * touch the gateway, so there is no cost to pass on, and leaving them free
   * gives customers a way to avoid the fee.
   */
  paymentFeePercent: {
    card: Number(process.env.PAYMENT_FEE_CARD_PERCENT ?? 5),
    online_banking: Number(process.env.PAYMENT_FEE_ONLINE_BANKING_PERCENT ?? 5),
    gcash: Number(process.env.PAYMENT_FEE_GCASH_PERCENT ?? 3),
    maya: Number(process.env.PAYMENT_FEE_MAYA_PERCENT ?? 3),
    bank_transfer: Number(process.env.PAYMENT_FEE_BANK_TRANSFER_PERCENT ?? 0),
    cod: Number(process.env.PAYMENT_FEE_COD_PERCENT ?? 0),
  } as Record<string, number>,

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

  /**
   * Google Geocoding, used to turn a typed address into coordinates.
   *
   * The couriers price on coordinates, not on address strings, so without this
   * every Lalamove and Transportify figure is an estimate from our own distance
   * table however valid their API keys are. Results are cached in the database,
   * so the same barangay is only ever paid for once.
   */
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  geocodeTimeoutMs: Number(process.env.GEOCODE_TIMEOUT_MS ?? 6000),

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

  /**
   * The inventory system at inventory.hdstradingopc.com, which owns stock and
   * receives paid orders as sales orders. Leave the URL or key blank and the
   * website simply does not push — everything else works unchanged.
   */
  inventory: {
    apiUrl: (process.env.INVENTORY_API_URL ?? '').replace(/\/+$/, ''),
    apiKey: process.env.INVENTORY_API_KEY ?? '',
    /** Sent as X-HDS-Client so the inventory audit log shows who called. */
    clientName: process.env.INVENTORY_CLIENT_NAME ?? 'website',
    /** Set false to keep the link configured but stop sending, e.g. during a stock take. */
    pushOrders: bool(process.env.INVENTORY_PUSH_ORDERS, true),
    /** Which warehouse fulfils website orders. Blank uses the inventory system's primary. */
    warehouseId: process.env.INVENTORY_WAREHOUSE_ID ?? '',
    /** How often the retry worker looks for orders that have not reached the warehouse. */
    retryIntervalMinutes: Number(process.env.INVENTORY_RETRY_MINUTES ?? 5),

    /** How often the catalog is pulled. 0 disables the schedule; manual sync still works. */
    syncIntervalMinutes: Number(process.env.INVENTORY_SYNC_MINUTES ?? 15),

    /**
     * SKUs that must never appear in the shop, whatever the inventory system says.
     *
     * For the test and sample items every warehouse accumulates. They have to
     * stay sellable in the inventory system to be useful for testing, so the
     * Sales Information tick cannot be the control — this is. Matched
     * case-insensitively, like every other SKU comparison here.
     */
    skuExclude: (process.env.INVENTORY_SKU_EXCLUDE ?? '')
      .split(',')
      .map((sku) => sku.trim().toLowerCase())
      .filter(Boolean),

    /**
     * Whether `selling_price` in the inventory system already contains VAT.
     *
     * This matters by exactly 12%. The website stores prices VAT-exclusive and
     * adds VAT at checkout, so an inclusive price imported as-is overcharges
     * every customer, and an exclusive price treated as inclusive undercharges.
     *
     * Defaults to false because that matches how the website already works and
     * the inventory system's own totals helper. Preview a sync before applying
     * it and check one product's price against what you expect.
     */
    pricesIncludeVat: bool(process.env.INVENTORY_PRICES_INCLUDE_VAT, false),
    timeoutMs: Number(process.env.INVENTORY_TIMEOUT_MS ?? 15_000),
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

/** The link is usable only with both an address and a key. */
export const inventoryConfigured = Boolean(env.inventory.apiUrl && env.inventory.apiKey);

export const geocodingConfigured = Boolean(env.googleMapsApiKey);

export const lalamoveConfigured = Boolean(env.lalamove.apiKey && env.lalamove.apiSecret);

/**
 * Whether a courier can actually be given a live price.
 *
 * Keys alone are not enough: without geocoding there are no coordinates to
 * quote against, so the request cannot be made at all. Exported so the staff
 * portal can say which of the two is missing rather than leaving somebody to
 * wonder why prices are still estimates after they pasted their keys in.
 */
export const liveCourierQuotesPossible = geocodingConfigured && lalamoveConfigured;
export const transportifyConfigured = Boolean(env.transportify.apiKey);
