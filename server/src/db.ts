import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';
import type {
  Booking,
  BookingStatus,
  DiscountCode,
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
  QuoteRequest,
  QuoteStatus,
  RatingSummary,
  Review,
  Service,
} from './types.js';

fs.mkdirSync(path.dirname(env.databaseFile), { recursive: true });

export const db = new Database(env.databaseFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    sku          TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL,
    subcategory  TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    price        REAL NOT NULL DEFAULT 0,
    unit         TEXT NOT NULL DEFAULT '',
    image        TEXT NOT NULL DEFAULT '',
    features     TEXT NOT NULL DEFAULT '[]',
    specs        TEXT NOT NULL DEFAULT '{}',
    is_bulk      INTEGER NOT NULL DEFAULT 0,
    min_bulk_qty INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    category           TEXT NOT NULL,
    tagline            TEXT NOT NULL DEFAULT '',
    description        TEXT NOT NULL DEFAULT '',
    base_price         REAL NOT NULL DEFAULT 0,
    unit               TEXT NOT NULL DEFAULT '',
    image              TEXT NOT NULL DEFAULT '',
    features           TEXT NOT NULL DEFAULT '[]',
    institutional_pros TEXT NOT NULL DEFAULT '[]',
    ideal_for          TEXT NOT NULL DEFAULT '[]',
    frequency_options  TEXT NOT NULL DEFAULT '[]',
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS discount_codes (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    type        TEXT NOT NULL CHECK (type IN ('percentage','fixed')),
    value       REAL NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id               TEXT PRIMARY KEY,
    reference        TEXT NOT NULL UNIQUE,
    client_name      TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    email            TEXT NOT NULL,
    phone            TEXT NOT NULL,
    address          TEXT NOT NULL,
    items            TEXT NOT NULL,
    urgency          TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'Received',
    instructions     TEXT,
    discount_code    TEXT,
    subtotal         REAL NOT NULL DEFAULT 0,
    discount_amount  REAL NOT NULL DEFAULT 0,
    vat              REAL NOT NULL DEFAULT 0,
    total            REAL NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id                  TEXT PRIMARY KEY,
    reference           TEXT NOT NULL UNIQUE,
    client_name         TEXT NOT NULL,
    institution_name    TEXT NOT NULL,
    email               TEXT NOT NULL,
    phone               TEXT NOT NULL,
    service_id          TEXT NOT NULL,
    service_name        TEXT NOT NULL,
    preferred_date      TEXT NOT NULL,
    preferred_time_slot TEXT NOT NULL,
    notes               TEXT,
    area_size           TEXT,
    booking_status      TEXT NOT NULL DEFAULT 'Confirmed',
    estimated_price     REAL NOT NULL DEFAULT 0,
    deposit_amount      REAL NOT NULL DEFAULT 0,
    deposit_status      TEXT NOT NULL DEFAULT 'unpaid',
    deposit_reference   TEXT,
    deposit_url         TEXT,
    deposit_paid_at     TEXT,
    balance_due         REAL NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  /* Dates staff have closed off — holidays, full crews, company events. */
  CREATE TABLE IF NOT EXISTS blocked_dates (
    date       TEXT PRIMARY KEY,
    reason     TEXT NOT NULL DEFAULT 'Fully booked',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id               TEXT PRIMARY KEY,
    subject_type     TEXT NOT NULL CHECK (subject_type IN ('product','service')),
    subject_id       TEXT NOT NULL,
    subject_name     TEXT NOT NULL,
    author_name      TEXT NOT NULL,
    institution_name TEXT,
    role             TEXT,
    rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment          TEXT NOT NULL DEFAULT '',
    verified         INTEGER NOT NULL DEFAULT 0,
    published        INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id                   TEXT PRIMARY KEY,
    reference            TEXT NOT NULL UNIQUE,
    customer_name        TEXT NOT NULL,
    institution_name     TEXT,
    email                TEXT NOT NULL,
    phone                TEXT NOT NULL,
    items                TEXT NOT NULL,
    address              TEXT NOT NULL,
    delivery             TEXT NOT NULL,
    payment_method       TEXT NOT NULL,
    payment_status       TEXT NOT NULL DEFAULT 'unpaid',
    order_status         TEXT NOT NULL DEFAULT 'pending_payment',
    payment_reference    TEXT,
    payment_url          TEXT,
    courier_booking_ref  TEXT,
    courier_tracking_url TEXT,
    notes                TEXT,
    discount_code        TEXT,
    subtotal             REAL NOT NULL DEFAULT 0,
    discount_amount      REAL NOT NULL DEFAULT 0,
    delivery_fee         REAL NOT NULL DEFAULT 0,
    vat                  REAL NOT NULL DEFAULT 0,
    total                REAL NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at              TEXT,
    inventory_status     TEXT NOT NULL DEFAULT 'pending',
    inventory_ref        TEXT,
    inventory_error      TEXT,
    inventory_attempts   INTEGER NOT NULL DEFAULT 0,
    /* Backoff: the worker ignores an order until this time has passed. */
    inventory_next_try   TEXT
  );
  /* Cached address -> coordinate lookups. Each miss costs money and latency,
     and the same barangays recur constantly, so answers are kept. */
  CREATE TABLE IF NOT EXISTS geocodes (
    key        TEXT PRIMARY KEY,
    lat        REAL NOT NULL,
    lng        REAL NOT NULL,
    precision  TEXT NOT NULL,
    formatted  TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/* --------------------------------------------------------------- migrations */

/**
 * Adds a column to an existing table.
 *
 * The CREATE TABLE statements above only run when a table does not yet exist,
 * so on a database that is already live — with real orders in it — a new column
 * added to one of them would never appear. Every column introduced after the
 * first release therefore has to be declared here as well.
 *
 * Safe to run on every boot: SQLite raises "duplicate column name" when it is
 * already present, which is the success case on the second and later runs.
 */
function addColumn(table: string, column: string, definition: string): boolean {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.info(`Migrated: added ${table}.${column}`);
    return true;
  } catch (error) {
    const message = (error as Error).message;
    if (!message.includes('duplicate column name')) throw error;
    return false;
  }
}

// Added when the inventory system link was introduced.
addColumn('products', 'sku', "TEXT NOT NULL DEFAULT ''");
// Mirrored from the inventory system by the catalog sync.
addColumn('products', 'is_listed', 'INTEGER NOT NULL DEFAULT 1');
addColumn('products', 'stock_tracked', 'INTEGER NOT NULL DEFAULT 0');
addColumn('products', 'stock_available', 'REAL');
addColumn('products', 'inventory_synced_at', 'TEXT');
const inventoryColumnIsNew = addColumn('orders', 'inventory_status', "TEXT NOT NULL DEFAULT 'pending'");
addColumn('orders', 'inventory_ref', 'TEXT');
addColumn('orders', 'inventory_error', 'TEXT');
addColumn('orders', 'inventory_attempts', 'INTEGER NOT NULL DEFAULT 0');
addColumn('orders', 'inventory_next_try', 'TEXT');
// Orders placed before the gateway fee was introduced carry none, and their
// stored totals already reflect that — a default of 0 keeps them arithmetically
// intact rather than making an old order look as though a fee went missing.
addColumn('orders', 'processing_fee', 'REAL NOT NULL DEFAULT 0');
// Whether a cancelled order's sales order has been voided, releasing the stock
// it had committed. Tracked separately from the push: an order can be delivered
// to the warehouse successfully and still need releasing later, and conflating
// the two would mean cancelling an order re-opened its push state.
addColumn('orders', 'inventory_void_status', "TEXT NOT NULL DEFAULT 'none'");

/**
 * Orders that predate the link are marked as skipped, not pending.
 *
 * The column defaults to 'pending' so that new orders queue for delivery, but
 * applying that default to history would mean every order ever placed floods
 * into the warehouse as a fresh sales order the first time the integration is
 * switched on — for goods that were shipped weeks ago.
 *
 * This runs once, in the same boot that adds the column, when by definition
 * every existing row predates the link. Staff can still send any one of them
 * by hand from the Warehouse tab.
 */
if (inventoryColumnIsNew) {
  const updated = db
    .prepare(
      `UPDATE orders
          SET inventory_status = 'skipped',
              inventory_error = 'Placed before the inventory system link was set up.'`,
    )
    .run().changes;
  if (updated > 0) {
    console.info(`Migrated: marked ${updated} existing order(s) as predating the inventory link.`);
  }
}

/**
 * Indexes come last, after every migration has run.
 *
 * They live here rather than beside the CREATE TABLE statements because an
 * index names a column, and on a database that already exists the table is not
 * recreated — so an index on a column added later would run before that column
 * did. SQLite raises "no such column" and the process dies on startup, taking
 * a working site down at the moment it is upgraded.
 */
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_reviews_subject ON reviews (subject_type, subject_id, published);
  CREATE INDEX IF NOT EXISTS idx_bookings_depref ON bookings (deposit_reference);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_invstatus ON orders (inventory_status);
  CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
  CREATE INDEX IF NOT EXISTS idx_orders_payref  ON orders (payment_reference);
  CREATE INDEX IF NOT EXISTS idx_quotes_created   ON quotes (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bookings_date    ON bookings (preferred_date);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry  ON sessions (expires_at);
`);

/* ------------------------------------------------------------------ mappers */

const json = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  subcategory: string;
  description: string;
  price: number;
  unit: string;
  image: string;
  features: string;
  specs: string;
  is_bulk: number;
  min_bulk_qty: number;
  is_listed: number;
  stock_tracked: number;
  stock_available: number | null;
  inventory_synced_at: string | null;
};

const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  name: r.name,
  sku: r.sku ?? '',
  category: r.category as Product['category'],
  subcategory: r.subcategory,
  description: r.description,
  price: r.price,
  unit: r.unit,
  image: r.image,
  features: json<string[]>(r.features, []),
  specs: json<Record<string, string>>(r.specs, {}),
  isBulkEligible: Boolean(r.is_bulk),
  minBulkQty: r.min_bulk_qty,
  isListed: r.is_listed !== 0,
  stockTracked: Boolean(r.stock_tracked),
  stockAvailable: r.stock_available,
  inventorySyncedAt: r.inventory_synced_at,
});

type ServiceRow = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  base_price: number;
  unit: string;
  image: string;
  features: string;
  institutional_pros: string;
  ideal_for: string;
  frequency_options: string;
};

const toService = (r: ServiceRow): Service => ({
  id: r.id,
  name: r.name,
  category: r.category as Service['category'],
  tagline: r.tagline,
  description: r.description,
  basePrice: r.base_price,
  unit: r.unit,
  image: r.image,
  features: json<string[]>(r.features, []),
  institutionalPros: json<string[]>(r.institutional_pros, []),
  idealFor: json<string[]>(r.ideal_for, []),
  frequencyOptions: json<string[]>(r.frequency_options, []),
});

type QuoteRow = {
  id: string;
  reference: string;
  client_name: string;
  institution_name: string;
  email: string;
  phone: string;
  address: string;
  items: string;
  urgency: string;
  status: string;
  instructions: string | null;
  discount_code: string | null;
  subtotal: number;
  discount_amount: number;
  vat: number;
  total: number;
  created_at: string;
};

const toQuote = (r: QuoteRow): QuoteRequest => ({
  id: r.id,
  reference: r.reference,
  clientName: r.client_name,
  institutionName: r.institution_name,
  email: r.email,
  phone: r.phone,
  address: r.address,
  items: json<QuoteRequest['items']>(r.items, []),
  urgency: r.urgency as QuoteRequest['urgency'],
  status: r.status as QuoteStatus,
  instructions: r.instructions ?? undefined,
  discountCode: r.discount_code,
  subtotal: r.subtotal,
  discountAmount: r.discount_amount,
  vat: r.vat,
  total: r.total,
  createdAt: r.created_at,
});

type BookingRow = {
  id: string;
  reference: string;
  client_name: string;
  institution_name: string;
  email: string;
  phone: string;
  service_id: string;
  service_name: string;
  preferred_date: string;
  preferred_time_slot: string;
  notes: string | null;
  area_size: string | null;
  booking_status: string;
  estimated_price: number;
  deposit_amount: number;
  deposit_status: string;
  deposit_reference: string | null;
  deposit_url: string | null;
  deposit_paid_at: string | null;
  balance_due: number;
  created_at: string;
};

const toBooking = (r: BookingRow): Booking => ({
  id: r.id,
  reference: r.reference,
  clientName: r.client_name,
  institutionName: r.institution_name,
  email: r.email,
  phone: r.phone,
  serviceId: r.service_id,
  serviceName: r.service_name,
  preferredDate: r.preferred_date,
  preferredTimeSlot: r.preferred_time_slot,
  notes: r.notes ?? undefined,
  areaSize: r.area_size ?? undefined,
  bookingStatus: r.booking_status as BookingStatus,
  estimatedPrice: r.estimated_price,
  createdAt: r.created_at,
  depositAmount: r.deposit_amount,
  depositStatus: r.deposit_status as PaymentStatus,
  depositReference: r.deposit_reference,
  depositUrl: r.deposit_url,
  depositPaidAt: r.deposit_paid_at,
  balanceDue: r.balance_due,
});

/* ------------------------------------------------------------------ queries */

export const products = {
  all(): Product[] {
    return (
      db.prepare('SELECT * FROM products ORDER BY sort_order, name').all() as ProductRow[]
    ).map(toProduct);
  },
  byId(id: string): Product | null {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined;
    return row ? toProduct(row) : null;
  },
  /**
   * Writes a product, leaving the sync-owned fields alone.
   *
   * Staff edit marketing copy; the catalog sync owns listing and stock. An
   * admin save that carried defaults for those would silently relist a hidden
   * product or wipe its stock figure, so they are only written when supplied.
   */
  upsert(p: Product, sortOrder = 0): Product {
    db.prepare(
      `INSERT INTO products (id, name, sku, category, subcategory, description, price, unit, image,
                             features, specs, is_bulk, min_bulk_qty, sort_order)
       VALUES (@id, @name, @sku, @category, @subcategory, @description, @price, @unit, @image,
               @features, @specs, @is_bulk, @min_bulk_qty, @sort_order)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, sku = excluded.sku, category = excluded.category,
         subcategory = excluded.subcategory,
         description = excluded.description, price = excluded.price, unit = excluded.unit,
         image = excluded.image, features = excluded.features, specs = excluded.specs,
         is_bulk = excluded.is_bulk, min_bulk_qty = excluded.min_bulk_qty`,
    ).run({
      id: p.id,
      name: p.name,
      sku: p.sku ?? '',
      category: p.category,
      subcategory: p.subcategory,
      description: p.description,
      price: p.price,
      unit: p.unit,
      image: p.image,
      features: JSON.stringify(p.features),
      specs: JSON.stringify(p.specs),
      is_bulk: p.isBulkEligible ? 1 : 0,
      min_bulk_qty: p.minBulkQty,
      sort_order: sortOrder,
    });
    return products.byId(p.id)!;
  },
  remove(id: string): boolean {
    return db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
  },
  /** Written only by the catalog sync — never by the admin product form. */
  /**
   * Takes stock for an order, atomically, or takes none of it.
   *
   * The check in `priceCart` reads the stock figure and nothing writes it back,
   * so before this existed the same three tins could be sold over and over until
   * the next catalogue sync — not only under concurrency, but to three customers
   * queuing politely one after another. Measured: six orders of two units each,
   * against a stock of three, all six accepted.
   *
   * The guard is the `stock_available >= ?` in the UPDATE rather than a read
   * followed by a write. SQLite applies it while holding the write lock, so two
   * requests cannot both see the last unit. The whole set of lines runs in one
   * transaction: an order that cannot be filled completely reserves nothing,
   * because a half-reserved order is stock removed from sale for goods nobody
   * has bought.
   *
   * This mirror is not the authority — the inventory system is — so it does not
   * need to be perfect, only monotonic between syncs. The next sync overwrites
   * it with the warehouse's own figure, which is what corrects for cancellations,
   * counter sales and anything else that happened elsewhere.
   */
  reserveStock(
    lines: { productId: string; quantity: number }[],
  ): { ok: true } | { ok: false; name: string; available: number } {
    const take = db.prepare(
      `UPDATE products
          SET stock_available = stock_available - @quantity
        WHERE id = @id
          AND stock_tracked = 1
          AND stock_available IS NOT NULL
          AND stock_available >= @quantity`,
    );

    let failure: { name: string; available: number } | null = null;

    const run = db.transaction((requested: { productId: string; quantity: number }[]) => {
      for (const line of requested) {
        const row = db
          .prepare('SELECT name, stock_tracked, stock_available FROM products WHERE id = ?')
          .get(line.productId) as
          | { name: string; stock_tracked: number; stock_available: number | null }
          | undefined;

        // Untracked items are not counted by the business at all, so there is
        // nothing to reserve and nothing to run out of.
        if (!row || !row.stock_tracked || row.stock_available === null) continue;

        const changed = take.run({ id: line.productId, quantity: line.quantity }).changes;
        if (changed === 0) {
          failure = { name: row.name, available: row.stock_available };
          // Throwing is what rolls the earlier lines back.
          throw new Error('insufficient stock');
        }
      }
    });

    try {
      run(lines);
      return { ok: true };
    } catch (error) {
      if (failure) return { ok: false, ...(failure as { name: string; available: number }) };
      throw error;
    }
  },

  setInventoryState(id: string, listed: boolean, tracked: boolean, available: number | null) {
    db.prepare(
      `UPDATE products
          SET is_listed = ?, stock_tracked = ?, stock_available = ?,
              inventory_synced_at = datetime('now')
        WHERE id = ?`,
    ).run(listed ? 1 : 0, tracked ? 1 : 0, available, id);
  },
  /** What customers may see: everything the inventory system still offers. */
  listed(): Product[] {
    return (
      db
        .prepare('SELECT * FROM products WHERE is_listed = 1 ORDER BY sort_order, name')
        .all() as ProductRow[]
    ).map(toProduct);
  },
  count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n;
  },
};

export const services = {
  all(): Service[] {
    return (
      db.prepare('SELECT * FROM services ORDER BY sort_order, name').all() as ServiceRow[]
    ).map(toService);
  },
  byId(id: string): Service | null {
    const row = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as ServiceRow | undefined;
    return row ? toService(row) : null;
  },
  upsert(s: Service, sortOrder = 0): Service {
    db.prepare(
      `INSERT INTO services (id, name, category, tagline, description, base_price, unit, image,
                             features, institutional_pros, ideal_for, frequency_options, sort_order)
       VALUES (@id, @name, @category, @tagline, @description, @base_price, @unit, @image,
               @features, @institutional_pros, @ideal_for, @frequency_options, @sort_order)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, category = excluded.category, tagline = excluded.tagline,
         description = excluded.description, base_price = excluded.base_price, unit = excluded.unit,
         image = excluded.image, features = excluded.features,
         institutional_pros = excluded.institutional_pros, ideal_for = excluded.ideal_for,
         frequency_options = excluded.frequency_options`,
    ).run({
      id: s.id,
      name: s.name,
      category: s.category,
      tagline: s.tagline,
      description: s.description,
      base_price: s.basePrice,
      unit: s.unit,
      image: s.image,
      features: JSON.stringify(s.features),
      institutional_pros: JSON.stringify(s.institutionalPros),
      ideal_for: JSON.stringify(s.idealFor),
      frequency_options: JSON.stringify(s.frequencyOptions),
      sort_order: sortOrder,
    });
    return services.byId(s.id)!;
  },
  remove(id: string): boolean {
    return db.prepare('DELETE FROM services WHERE id = ?').run(id).changes > 0;
  },
  count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM services').get() as { n: number }).n;
  },
};

type DiscountRow = {
  id: string;
  code: string;
  type: string;
  value: number;
  description: string;
  active: number;
};

const toDiscount = (r: DiscountRow): DiscountCode => ({
  id: r.id,
  code: r.code,
  type: r.type as DiscountCode['type'],
  value: r.value,
  description: r.description,
});

export const discounts = {
  all(): DiscountCode[] {
    return (
      db.prepare('SELECT * FROM discount_codes ORDER BY created_at DESC').all() as DiscountRow[]
    ).map(toDiscount);
  },
  /** Case-insensitive lookup, active codes only — used by the public checkout. */
  findActive(code: string): DiscountCode | null {
    const row = db
      .prepare('SELECT * FROM discount_codes WHERE code = ? COLLATE NOCASE AND active = 1')
      .get(code.trim()) as DiscountRow | undefined;
    return row ? toDiscount(row) : null;
  },
  create(d: DiscountCode): DiscountCode {
    db.prepare(
      `INSERT INTO discount_codes (id, code, type, value, description)
       VALUES (@id, @code, @type, @value, @description)`,
    ).run({ ...d, code: d.code.trim().toUpperCase() });
    return d;
  },
  remove(id: string): boolean {
    return db.prepare('DELETE FROM discount_codes WHERE id = ?').run(id).changes > 0;
  },
  count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM discount_codes').get() as { n: number }).n;
  },
};

export const quotes = {
  insert(q: QuoteRequest): QuoteRequest {
    db.prepare(
      `INSERT INTO quotes (id, reference, client_name, institution_name, email, phone, address,
                           items, urgency, status, instructions, discount_code,
                           subtotal, discount_amount, vat, total, created_at)
       VALUES (@id, @reference, @client_name, @institution_name, @email, @phone, @address,
               @items, @urgency, @status, @instructions, @discount_code,
               @subtotal, @discount_amount, @vat, @total, @created_at)`,
    ).run({
      id: q.id,
      reference: q.reference,
      client_name: q.clientName,
      institution_name: q.institutionName,
      email: q.email,
      phone: q.phone,
      address: q.address,
      items: JSON.stringify(q.items),
      urgency: q.urgency,
      status: q.status,
      instructions: q.instructions ?? null,
      discount_code: q.discountCode ?? null,
      subtotal: q.subtotal,
      discount_amount: q.discountAmount,
      vat: q.vat,
      total: q.total,
      created_at: q.createdAt,
    });
    return q;
  },
  all(): QuoteRequest[] {
    return (db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all() as QuoteRow[]).map(
      toQuote,
    );
  },
  byReference(reference: string): QuoteRequest | null {
    const row = db.prepare('SELECT * FROM quotes WHERE reference = ?').get(reference) as
      | QuoteRow
      | undefined;
    return row ? toQuote(row) : null;
  },
  setStatus(id: string, status: QuoteStatus): boolean {
    return db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, id).changes > 0;
  },
  count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM quotes').get() as { n: number }).n;
  },
};

export const bookings = {
  insert(b: Booking): Booking {
    db.prepare(
      `INSERT INTO bookings (id, reference, client_name, institution_name, email, phone,
                             service_id, service_name, preferred_date, preferred_time_slot,
                             notes, area_size, booking_status, estimated_price,
                             deposit_amount, deposit_status, balance_due, created_at)
       VALUES (@id, @reference, @client_name, @institution_name, @email, @phone,
               @service_id, @service_name, @preferred_date, @preferred_time_slot,
               @notes, @area_size, @booking_status, @estimated_price,
               @deposit_amount, @deposit_status, @balance_due, @created_at)`,
    ).run({
      id: b.id,
      reference: b.reference,
      client_name: b.clientName,
      institution_name: b.institutionName,
      email: b.email,
      phone: b.phone,
      service_id: b.serviceId,
      service_name: b.serviceName,
      preferred_date: b.preferredDate,
      preferred_time_slot: b.preferredTimeSlot,
      notes: b.notes ?? null,
      area_size: b.areaSize ?? null,
      booking_status: b.bookingStatus,
      estimated_price: b.estimatedPrice,
      deposit_amount: b.depositAmount,
      deposit_status: b.depositStatus,
      balance_due: b.balanceDue,
      created_at: b.createdAt,
    });
    return b;
  },
  all(): Booking[] {
    return (db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all() as BookingRow[]).map(
      toBooking,
    );
  },
  byReference(reference: string): Booking | null {
    const row = db.prepare('SELECT * FROM bookings WHERE reference = ?').get(reference) as
      | BookingRow
      | undefined;
    return row ? toBooking(row) : null;
  },
  byId(id: string): Booking | null {
    const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as BookingRow | undefined;
    return row ? toBooking(row) : null;
  },
  byDepositReference(reference: string): Booking | null {
    const row = db.prepare('SELECT * FROM bookings WHERE deposit_reference = ?').get(reference) as
      | BookingRow
      | undefined;
    return row ? toBooking(row) : null;
  },
  /**
   * How many crews are already committed per time slot across a date range.
   * One query for the whole calendar month rather than one per day.
   */
  slotLoad(fromDate: string, toDate: string): { date: string; slot: string; taken: number }[] {
    return db
      .prepare(
        `SELECT preferred_date AS date, preferred_time_slot AS slot, COUNT(*) AS taken
         FROM bookings
         WHERE preferred_date BETWEEN ? AND ? AND booking_status != 'Cancelled'
         GROUP BY preferred_date, preferred_time_slot`,
      )
      .all(fromDate, toDate) as { date: string; slot: string; taken: number }[];
  },
  /** Committed crews for one date and slot — re-checked at submit time. */
  slotCount(date: string, slot: string): number {
    return (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM bookings
           WHERE preferred_date = ? AND preferred_time_slot = ? AND booking_status != 'Cancelled'`,
        )
        .get(date, slot) as { n: number }
    ).n;
  },
  setStatus(id: string, status: BookingStatus): boolean {
    return (
      db.prepare('UPDATE bookings SET booking_status = ? WHERE id = ?').run(status, id).changes > 0
    );
  },
  setDepositSession(id: string, reference: string, url: string) {
    db.prepare('UPDATE bookings SET deposit_reference = ?, deposit_url = ? WHERE id = ?').run(
      reference,
      url,
      id,
    );
  },
  /** Returns false if the deposit was already settled, so webhook retries are safe. */
  markDepositPaid(id: string): boolean {
    return (
      db
        .prepare(
          `UPDATE bookings
           SET deposit_status = 'paid', deposit_paid_at = datetime('now')
           WHERE id = ? AND deposit_status != 'paid'`,
        )
        .run(id).changes > 0
    );
  },
  count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM bookings').get() as { n: number }).n;
  },
};

export const blockedDates = {
  /** Dates staff have closed, as a set for fast lookup while building a calendar. */
  between(fromDate: string, toDate: string): Map<string, string> {
    const rows = db
      .prepare('SELECT date, reason FROM blocked_dates WHERE date BETWEEN ? AND ?')
      .all(fromDate, toDate) as { date: string; reason: string }[];
    return new Map(rows.map((r) => [r.date, r.reason]));
  },
  isBlocked(date: string): string | null {
    const row = db.prepare('SELECT reason FROM blocked_dates WHERE date = ?').get(date) as
      | { reason: string }
      | undefined;
    return row?.reason ?? null;
  },
  all(): { date: string; reason: string }[] {
    return db.prepare('SELECT date, reason FROM blocked_dates ORDER BY date').all() as {
      date: string;
      reason: string;
    }[];
  },
  block(date: string, reason: string) {
    db.prepare(
      `INSERT INTO blocked_dates (date, reason) VALUES (?, ?)
       ON CONFLICT(date) DO UPDATE SET reason = excluded.reason`,
    ).run(date, reason);
  },
  unblock(date: string): boolean {
    return db.prepare('DELETE FROM blocked_dates WHERE date = ?').run(date).changes > 0;
  },
};

type ReviewRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_name: string;
  author_name: string;
  institution_name: string | null;
  role: string | null;
  rating: number;
  comment: string;
  verified: number;
  published: number;
  created_at: string;
};

const toReview = (r: ReviewRow): Review => ({
  id: r.id,
  subjectType: r.subject_type as Review['subjectType'],
  subjectId: r.subject_id,
  subjectName: r.subject_name,
  authorName: r.author_name,
  institutionName: r.institution_name ?? undefined,
  role: r.role ?? undefined,
  rating: r.rating,
  comment: r.comment,
  verified: Boolean(r.verified),
  published: Boolean(r.published),
  createdAt: r.created_at,
});

export const reviews = {
  insert(r: Review): Review {
    db.prepare(
      `INSERT INTO reviews (id, subject_type, subject_id, subject_name, author_name,
                            institution_name, role, rating, comment, verified, published, created_at)
       VALUES (@id, @subject_type, @subject_id, @subject_name, @author_name,
               @institution_name, @role, @rating, @comment, @verified, @published, @created_at)`,
    ).run({
      id: r.id,
      subject_type: r.subjectType,
      subject_id: r.subjectId,
      subject_name: r.subjectName,
      author_name: r.authorName,
      institution_name: r.institutionName ?? null,
      role: r.role ?? null,
      rating: r.rating,
      comment: r.comment,
      verified: r.verified ? 1 : 0,
      published: r.published ? 1 : 0,
      created_at: r.createdAt,
    });
    return r;
  },
  /** Published reviews only — what the public site shows. */
  published(subjectType?: string, subjectId?: string): Review[] {
    if (subjectType && subjectId) {
      return (
        db
          .prepare(
            `SELECT * FROM reviews
             WHERE published = 1 AND subject_type = ? AND subject_id = ?
             ORDER BY created_at DESC`,
          )
          .all(subjectType, subjectId) as ReviewRow[]
      ).map(toReview);
    }
    return (
      db
        .prepare('SELECT * FROM reviews WHERE published = 1 ORDER BY created_at DESC LIMIT 200')
        .all() as ReviewRow[]
    ).map(toReview);
  },
  /** Everything including unmoderated submissions — admin only. */
  all(): Review[] {
    return (
      db.prepare('SELECT * FROM reviews ORDER BY published ASC, created_at DESC').all() as ReviewRow[]
    ).map(toReview);
  },
  /** Average and star distribution per subject, for the whole catalog at once. */
  summaries(): Map<string, RatingSummary> {
    const rows = db
      .prepare(
        `SELECT subject_type, subject_id, rating, COUNT(*) AS n
         FROM reviews WHERE published = 1
         GROUP BY subject_type, subject_id, rating`,
      )
      .all() as { subject_type: string; subject_id: string; rating: number; n: number }[];

    const out = new Map<string, RatingSummary>();
    for (const row of rows) {
      const key = `${row.subject_type}:${row.subject_id}`;
      const entry =
        out.get(key) ?? { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] as RatingSummary['distribution'] };
      entry.distribution[row.rating - 1] += row.n;
      entry.count += row.n;
      out.set(key, entry);
    }
    for (const entry of out.values()) {
      const total = entry.distribution.reduce((sum, n, i) => sum + n * (i + 1), 0);
      entry.average = entry.count ? Math.round((total / entry.count) * 10) / 10 : 0;
    }
    return out;
  },
  setPublished(id: string, published: boolean): boolean {
    return (
      db.prepare('UPDATE reviews SET published = ? WHERE id = ?').run(published ? 1 : 0, id)
        .changes > 0
    );
  },
  remove(id: string): boolean {
    return db.prepare('DELETE FROM reviews WHERE id = ?').run(id).changes > 0;
  },
  count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM reviews').get() as { n: number }).n;
  },
  pendingCount(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE published = 0').get() as { n: number })
      .n;
  },
};

type OrderRow = {
  id: string;
  reference: string;
  customer_name: string;
  institution_name: string | null;
  email: string;
  phone: string;
  items: string;
  address: string;
  delivery: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  payment_reference: string | null;
  payment_url: string | null;
  courier_booking_ref: string | null;
  courier_tracking_url: string | null;
  notes: string | null;
  discount_code: string | null;
  subtotal: number;
  discount_amount: number;
  delivery_fee: number;
  vat: number;
  processing_fee: number;
  total: number;
  created_at: string;
  paid_at: string | null;
  inventory_status: string;
  inventory_void_status: string;
  inventory_ref: string | null;
  inventory_error: string | null;
  inventory_attempts: number;
};

const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  reference: r.reference,
  customerName: r.customer_name,
  institutionName: r.institution_name ?? undefined,
  email: r.email,
  phone: r.phone,
  items: json<Order['items']>(r.items, []),
  address: json<Order['address']>(r.address, {} as Order['address']),
  delivery: json<Order['delivery']>(r.delivery, {} as Order['delivery']),
  paymentMethod: r.payment_method as Order['paymentMethod'],
  paymentStatus: r.payment_status as PaymentStatus,
  orderStatus: r.order_status as OrderStatus,
  paymentReference: r.payment_reference,
  paymentUrl: r.payment_url,
  courierBookingRef: r.courier_booking_ref,
  courierTrackingUrl: r.courier_tracking_url,
  notes: r.notes ?? undefined,
  discountCode: r.discount_code,
  subtotal: r.subtotal,
  discountAmount: r.discount_amount,
  deliveryFee: r.delivery_fee,
  vat: r.vat,
  processingFee: r.processing_fee ?? 0,
  total: r.total,
  createdAt: r.created_at,
  paidAt: r.paid_at,
  inventoryStatus: (r.inventory_status ?? 'pending') as Order['inventoryStatus'],
  inventoryVoidStatus: (r.inventory_void_status ?? 'none') as Order['inventoryVoidStatus'],
  inventoryRef: r.inventory_ref,
  inventoryError: r.inventory_error,
  inventoryAttempts: r.inventory_attempts ?? 0,
});

export const geocodes = {
  /**
   * A cached lookup, if it is still within its lifetime.
   *
   * Hits and misses expire on different schedules: a building's coordinates do
   * not change, whereas an address Google could not find today may simply have
   * been missing from its data, so failures are retried sooner.
   */
  get(key: string, hitTtlDays: number, missTtlDays: number) {
    const row = db
      .prepare('SELECT lat, lng, precision, formatted, created_at FROM geocodes WHERE key = ?')
      .get(key) as
      | { lat: number; lng: number; precision: string; formatted: string; created_at: string }
      | undefined;
    if (!row) return null;

    const ttlDays = row.precision === 'none' ? missTtlDays : hitTtlDays;
    const ageDays = (Date.now() - new Date(`${row.created_at}Z`).getTime()) / 86_400_000;
    if (!Number.isFinite(ageDays) || ageDays > ttlDays) return null;

    return {
      lat: row.lat,
      lng: row.lng,
      precision: row.precision as 'exact' | 'approximate' | 'none',
      formatted: row.formatted,
    };
  },
  put(key: string, result: { lat: number; lng: number; precision: string; formatted: string }) {
    db.prepare(
      `INSERT INTO geocodes (key, lat, lng, precision, formatted, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         lat = excluded.lat, lng = excluded.lng, precision = excluded.precision,
         formatted = excluded.formatted, created_at = excluded.created_at`,
    ).run(key, result.lat, result.lng, result.precision, result.formatted);
  },
  count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM geocodes').get() as { n: number }).n;
  },
};

export const orders = {
  insert(o: Order): Order {
    db.prepare(
      `INSERT INTO orders (id, reference, customer_name, institution_name, email, phone, items,
                           address, delivery, payment_method, payment_status, order_status,
                           payment_reference, payment_url, notes, discount_code,
                           subtotal, discount_amount, delivery_fee, vat, processing_fee, total, created_at)
       VALUES (@id, @reference, @customer_name, @institution_name, @email, @phone, @items,
               @address, @delivery, @payment_method, @payment_status, @order_status,
               @payment_reference, @payment_url, @notes, @discount_code,
               @subtotal, @discount_amount, @delivery_fee, @vat, @processing_fee, @total, @created_at)`,
    ).run({
      id: o.id,
      reference: o.reference,
      customer_name: o.customerName,
      institution_name: o.institutionName ?? null,
      email: o.email,
      phone: o.phone,
      items: JSON.stringify(o.items),
      address: JSON.stringify(o.address),
      delivery: JSON.stringify(o.delivery),
      payment_method: o.paymentMethod,
      payment_status: o.paymentStatus,
      order_status: o.orderStatus,
      payment_reference: o.paymentReference ?? null,
      payment_url: o.paymentUrl ?? null,
      notes: o.notes ?? null,
      discount_code: o.discountCode ?? null,
      subtotal: o.subtotal,
      discount_amount: o.discountAmount,
      delivery_fee: o.deliveryFee,
      vat: o.vat,
      processing_fee: o.processingFee,
      total: o.total,
      created_at: o.createdAt,
    });
    return o;
  },
  all(): Order[] {
    return (db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as OrderRow[]).map(
      toOrder,
    );
  },
  byId(id: string): Order | null {
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
    return row ? toOrder(row) : null;
  },
  byReference(reference: string): Order | null {
    const row = db.prepare('SELECT * FROM orders WHERE reference = ?').get(reference) as
      | OrderRow
      | undefined;
    return row ? toOrder(row) : null;
  },
  byPaymentReference(paymentReference: string): Order | null {
    const row = db.prepare('SELECT * FROM orders WHERE payment_reference = ?').get(
      paymentReference,
    ) as OrderRow | undefined;
    return row ? toOrder(row) : null;
  },
  setPaymentSession(id: string, paymentReference: string, paymentUrl: string) {
    db.prepare('UPDATE orders SET payment_reference = ?, payment_url = ? WHERE id = ?').run(
      paymentReference,
      paymentUrl,
      id,
    );
  },
  /**
   * Marks an order paid. Returns false when it was already paid, so webhook
   * retries do not fire the confirmation email more than once.
   */
  markPaid(id: string): boolean {
    const result = db
      .prepare(
        `UPDATE orders
         SET payment_status = 'paid',
             paid_at = datetime('now'),
             order_status = CASE WHEN order_status = 'pending_payment' THEN 'processing' ELSE order_status END
         WHERE id = ? AND payment_status != 'paid'`,
      )
      .run(id);
    return result.changes > 0;
  },
  setPaymentStatus(id: string, status: PaymentStatus): boolean {
    return db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(status, id).changes > 0;
  },
  setOrderStatus(id: string, status: OrderStatus): boolean {
    return db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(status, id).changes > 0;
  },

  /**
   * Moves an order forward, and only forward.
   *
   * Two systems report on the same order now: the warehouse says when it was
   * picked and packed, the courier says when it was collected and delivered.
   * They observe different halves of the journey and they do not agree about
   * the moment in between — the warehouse may still be calling an order
   * `packed` while the rider is already carrying it. Letting each write freely
   * makes the customer's tracking flip back and forth on whichever polled last.
   *
   * Ranking the states and refusing to go backwards removes the argument
   * without either system having to know the other exists.
   *
   * Cancellation is the exception, because it can legitimately interrupt at any
   * point — except after delivery, where the goods have already arrived and the
   * instrument is a return, not a cancellation.
   */
  advanceOrderStatus(id: string, status: OrderStatus): boolean {
    const rank: Record<OrderStatus, number> = {
      pending_payment: 0,
      processing: 1,
      ready_for_dispatch: 2,
      in_transit: 3,
      delivered: 4,
      cancelled: 5,
    };
    const current = (db.prepare('SELECT order_status FROM orders WHERE id = ?').get(id) as
      | { order_status: OrderStatus }
      | undefined)?.order_status;
    if (!current) return false;
    if (current === 'cancelled') return false;
    if (status === 'cancelled') return current === 'delivered' ? false : this.setOrderStatus(id, status);
    if (rank[status] <= rank[current]) return false;
    return this.setOrderStatus(id, status);
  },

  byCourierRef(ref: string): Order | null {
    const row = db
      .prepare("SELECT * FROM orders WHERE courier_booking_ref = ? AND courier_booking_ref <> ''")
      .get(ref) as OrderRow | undefined;
    return row ? toOrder(row) : null;
  },

  /** Updates only the tracking link, leaving the booking reference alone. */
  setCourierTrackingUrl(id: string, trackingUrl: string): boolean {
    return (
      db.prepare('UPDATE orders SET courier_tracking_url = ? WHERE id = ?').run(trackingUrl, id)
        .changes > 0
    );
  },

  /** Releases a booking the courier cancelled, so staff can dispatch again. */
  clearCourierBooking(id: string): boolean {
    return (
      db
        .prepare('UPDATE orders SET courier_booking_ref = NULL, courier_tracking_url = NULL WHERE id = ?')
        .run(id).changes > 0
    );
  },
  setCourierBooking(id: string, ref: string, trackingUrl: string | null): boolean {
    return (
      db
        .prepare('UPDATE orders SET courier_booking_ref = ?, courier_tracking_url = ? WHERE id = ?')
        .run(ref, trackingUrl, id).changes > 0
    );
  },
  /* ------------------------------------------------ inventory system push */

  /**
   * Orders due to be sent to the inventory system.
   *
   * `pending` only — `failed` needs a person to fix the cause (usually a SKU)
   * and retry by hand, and retrying it automatically would just log the same
   * error every few minutes. The backoff time gates how soon a transient
   * failure is tried again.
   */
  duePushes(limit = 25, ignoreBackoff = false): Order[] {
    return (
      db
        .prepare(
          `SELECT * FROM orders
            WHERE inventory_status = 'pending'
              AND (? = 1 OR inventory_next_try IS NULL OR inventory_next_try <= datetime('now'))
            ORDER BY created_at
            LIMIT ?`,
        )
        .all(ignoreBackoff ? 1 : 0, limit) as OrderRow[]
    ).map(toOrder);
  },
  /** Orders staff need to see: still queued, or given up on. */
  pushBacklog(): Order[] {
    return (
      db
        .prepare(
          `SELECT * FROM orders
            WHERE inventory_status IN ('pending','failed')
            ORDER BY created_at DESC`,
        )
        .all() as OrderRow[]
    ).map(toOrder);
  },
  setInventorySent(id: string, salesOrderNumber: string) {
    db.prepare(
      `UPDATE orders
          SET inventory_status = 'sent', inventory_ref = ?, inventory_error = NULL,
              inventory_next_try = NULL
        WHERE id = ?`,
    ).run(salesOrderNumber, id);
  },
  /**
   * Records a failed attempt. `retryInMinutes` null means do not retry
   * automatically — the cause will not resolve itself.
   */
  setInventoryFailure(id: string, message: string, retryInMinutes: number | null) {
    db.prepare(
      `UPDATE orders
          SET inventory_status = ?,
              inventory_error = ?,
              inventory_attempts = inventory_attempts + 1,
              inventory_next_try = CASE WHEN ? IS NULL THEN NULL
                                        ELSE datetime('now', '+' || ? || ' minutes') END
        WHERE id = ?`,
    ).run(retryInMinutes === null ? 'failed' : 'pending', message, retryInMinutes, retryInMinutes, id);
  },
  setInventoryStatus(id: string, status: Order['inventoryStatus'], message: string | null = null) {
    db.prepare(
      `UPDATE orders SET inventory_status = ?, inventory_error = ? WHERE id = ?`,
    ).run(status, message, id);
  },
  /** Clears the backoff and error so a staff retry runs on the next tick. */
  requeueInventoryPush(id: string): boolean {
    return (
      db
        .prepare(
          `UPDATE orders
              SET inventory_status = 'pending', inventory_error = NULL, inventory_next_try = NULL
            WHERE id = ? AND inventory_status != 'sent'`,
        )
        .run(id).changes > 0
    );
  },
  /**
   * Orders in the warehouse's hands but not yet finished, for status polling.
   *
   * Only those actually sent — an order the inventory system never received has
   * no status to report — and only those still moving. Delivered and cancelled
   * orders are terminal, so polling them forever would grow the request with
   * every order ever placed.
   */
  awaitingFulfilment(): Order[] {
    return (
      db
        .prepare(
          `SELECT * FROM orders
            WHERE inventory_status = 'sent'
              AND order_status NOT IN ('delivered','cancelled')
            ORDER BY created_at DESC
            LIMIT 100`,
        )
        .all() as OrderRow[]
    ).map(toOrder);
  },
  /* ---------------------------------------------- releasing cancelled stock */

  /**
   * Cancelled orders whose sales order still holds stock.
   *
   * Only those actually delivered to the warehouse: an order it never received
   * committed nothing there, so there is nothing to release and asking would
   * only produce a 404 every few minutes.
   */
  dueVoids(limit = 25): Order[] {
    return (
      db
        .prepare(
          `SELECT * FROM orders
            WHERE order_status = 'cancelled'
              AND inventory_status = 'sent'
              AND inventory_void_status = 'pending'
            ORDER BY created_at
            LIMIT ?`,
        )
        .all(limit) as OrderRow[]
    ).map(toOrder);
  },
  setInventoryVoidStatus(id: string, status: Order['inventoryVoidStatus'], message?: string | null) {
    db.prepare(
      `UPDATE orders
          SET inventory_void_status = ?,
              inventory_error = COALESCE(?, inventory_error)
        WHERE id = ?`,
    ).run(status, message ?? null, id);
  },
  inventoryCounts(): { pending: number; failed: number; sent: number; voidsPending: number } {
    const rows = db
      .prepare('SELECT inventory_status AS status, COUNT(*) AS n FROM orders GROUP BY inventory_status')
      .all() as { status: string; n: number }[];
    const get = (status: string) => rows.find((r) => r.status === status)?.n ?? 0;
    const voidsPending = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM orders
            WHERE order_status = 'cancelled' AND inventory_status = 'sent'
              AND inventory_void_status = 'pending'`,
        )
        .get() as { n: number }
    ).n;
    return { pending: get('pending'), failed: get('failed'), sent: get('sent'), voidsPending };
  },

  count(): number {
    return (db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n;
  },
  revenue(): number {
    return (
      (
        db.prepare("SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE payment_status = 'paid'").get() as {
          s: number;
        }
      ).s ?? 0
    );
  },
};

export const sessions = {
  create(token: string, email: string, expiresAt: number) {
    db.prepare('INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)').run(
      token,
      email,
      expiresAt,
    );
  },
  find(token: string): { email: string; expiresAt: number } | null {
    const row = db.prepare('SELECT email, expires_at FROM sessions WHERE token = ?').get(token) as
      | { email: string; expires_at: number }
      | undefined;
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      sessions.remove(token);
      return null;
    }
    return { email: row.email, expiresAt: row.expires_at };
  },
  remove(token: string) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },
  purgeExpired() {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  },
};
