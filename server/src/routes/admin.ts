import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../env.js';
import {
  adminUsers,
  blockedDates,
  bookings,
  discounts,
  orders,
  posts,
  products,
  quotes,
  reviews,
  services,
  siteSettings,
  type AdminRole,
  type Post,
} from '../db.js';
import {
  currentAdmin,
  endSession,
  hashPassword,
  requireAdmin,
  requireRole,
  startSession,
  verifyCredentials,
  type AuthedRequest,
} from '../auth.js';
import { bookLalamoveDelivery } from '../lib/delivery.js';
import { ping as inventoryPing, InventoryError } from '../lib/inventory.js';
import { attemptVoid, drainQueue, queueVoid, retryPush } from '../lib/inventory-queue.js';
import { syncCatalog } from '../lib/inventory-catalog.js';
import { inventoryConfigured } from '../env.js';
import { newId } from '../lib/pricing.js';
import { settingsWithDefaults } from '../lib/site-info.js';
import {
  adminUserSchema,
  blockDateSchema,
  bookingStatusSchema,
  discountSchema,
  fieldErrors,
  loginSchema,
  passwordSchema,
  postSchema,
  productSchema,
  quoteStatusSchema,
  serviceSchema,
  siteSettingsSchema,
} from '../validation.js';
import type { Product, Service } from '../types.js';

export const adminRouter = Router();

/** Deliberately tight: brute-forcing the admin password should not be viable. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
});

/**
 * A second limit, counted per account rather than per address.
 *
 * The limiter above stops one machine hammering the portal. It does not stop
 * many machines each trying one password against the same account, which is the
 * shape a real attempt on a known email address takes. This closes that: ten
 * failures against one account and it stops answering for fifteen minutes, no
 * matter where the attempts come from.
 *
 * Kept in memory deliberately. The window is short, the entries are tiny, and a
 * restart clearing it is not a hole worth a database write on every sign-in.
 */
const ACCOUNT_LOCK_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LOCK_AFTER = 10;
const failuresByAccount = new Map<string, { count: number; firstAt: number }>();

function accountIsLocked(email: string): boolean {
  const record = failuresByAccount.get(email);
  if (!record) return false;
  if (Date.now() - record.firstAt > ACCOUNT_LOCK_WINDOW_MS) {
    failuresByAccount.delete(email);
    return false;
  }
  return record.count >= ACCOUNT_LOCK_AFTER;
}

function recordFailure(email: string) {
  const record = failuresByAccount.get(email);
  if (!record || Date.now() - record.firstAt > ACCOUNT_LOCK_WINDOW_MS) {
    failuresByAccount.set(email, { count: 1, firstAt: Date.now() });
    return;
  }
  record.count += 1;
}

// Entries expire on read, but an address tried once and then abandoned would sit
// there forever. Sweeping hourly keeps the map bounded on a long-lived process.
setInterval(() => {
  const cutoff = Date.now() - ACCOUNT_LOCK_WINDOW_MS;
  for (const [email, record] of failuresByAccount) {
    if (record.firstAt < cutoff) failuresByAccount.delete(email);
  }
}, 60 * 60 * 1000).unref();

adminRouter.post('/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please enter your email and password.' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (accountIsLocked(email)) {
    res.status(429).json({
      error: 'Too many sign-in attempts on this account. Please try again in 15 minutes.',
    });
    return;
  }

  const user = verifyCredentials(email, parsed.data.password);
  if (!user) {
    recordFailure(email);
    // Deliberately vague — do not reveal which half was wrong, nor whether the
    // account exists, is deactivated, or simply had the password mistyped.
    res.status(401).json({ error: 'Those credentials do not match our records.' });
    return;
  }

  // Signing in clears the count, so a colleague who mistyped twice and then got
  // it right does not carry those failures into their next bad morning.
  failuresByAccount.delete(email);
  const expiresAt = startSession(res, user);
  res.json({ email: user.email, name: user.name, role: user.role, expiresAt });
});

adminRouter.post('/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

/** Lets the admin app decide whether to show the login screen on load. */
adminRouter.get('/me', (req, res) => {
  const admin = currentAdmin(req);
  if (!admin) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.json({ email: admin.email, name: admin.name, role: admin.role });
});

// Everything below requires a valid session.
adminRouter.use(requireAdmin);

/**
 * Who may reach what.
 *
 * Gated by path prefix rather than route by route, because there are forty-odd
 * routes and the one somebody forgets to annotate is the one that leaks. A new
 * endpoint under an existing prefix inherits the right rule automatically; a
 * new prefix has to be added here, and until it is, only a super admin can use
 * it — which fails closed rather than open.
 *
 * The split follows how the business actually divides:
 *   - the shop and the warehouse: orders, stock, catalogue, pricing
 *   - the website: what customers read, and what they say back
 *   - the company itself: contact details, and who may sign in
 */
const RUNS_THE_SHOP = requireRole('super_admin', 'inventory_manager');
const RUNS_THE_WEBSITE = requireRole('super_admin', 'website_admin');
const OWNER_ONLY = requireRole('super_admin');

adminRouter.use('/products', RUNS_THE_SHOP);
adminRouter.use('/orders', RUNS_THE_SHOP);
adminRouter.use('/quotes', RUNS_THE_SHOP);
adminRouter.use('/discounts', RUNS_THE_SHOP);
adminRouter.use('/inventory', RUNS_THE_SHOP);
adminRouter.use('/export', RUNS_THE_SHOP);

adminRouter.use('/services', RUNS_THE_WEBSITE);
adminRouter.use('/bookings', RUNS_THE_WEBSITE);
adminRouter.use('/blocked-dates', RUNS_THE_WEBSITE);
adminRouter.use('/reviews', RUNS_THE_WEBSITE);
adminRouter.use('/posts', RUNS_THE_WEBSITE);

adminRouter.use('/settings', OWNER_ONLY);
adminRouter.use('/users', OWNER_ONLY);
adminRouter.use('/integrations', OWNER_ONLY);

/* --------------------------------------------------------------- dashboard */

adminRouter.get('/stats', (_req, res) => {
  const allOrders = orders.all();
  const allBookings = bookings.all();
  res.json({
    products: products.count(),
    services: services.count(),
    orders: orders.count(),
    paidOrders: allOrders.filter((o) => o.paymentStatus === 'paid').length,
    pendingOrders: allOrders.filter((o) => o.orderStatus === 'pending_payment').length,
    revenue: orders.revenue(),
    quotes: quotes.count(),
    bookings: bookings.count(),
    upcomingBookings: allBookings.filter(
      (b) => b.preferredDate >= new Date().toISOString().slice(0, 10) && b.bookingStatus !== 'Cancelled',
    ).length,
    depositsOutstanding: allBookings
      .filter((b) => b.depositStatus !== 'paid' && b.bookingStatus === 'Confirmed')
      .reduce((sum, b) => sum + b.depositAmount, 0),
    reviews: reviews.count(),
    pendingReviews: reviews.pendingCount(),
    inventory: orders.inventoryCounts(),
  });
});

/* ---------------------------------------------------------------- catalogue */

adminRouter.get('/products', (_req, res) => res.json({ products: products.all() }));

adminRouter.post('/products', (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  // A product added by hand is listed and not stock-tracked; the catalog sync
  // takes ownership of those the moment a matching SKU appears in inventory.
  const product: Product = {
    ...parsed.data,
    id: parsed.data.id || `prod-${newId().slice(0, 8)}`,
    isListed: true,
    stockTracked: false,
    stockAvailable: null,
  };
  res.status(201).json({ product: products.upsert(product) });
});

adminRouter.put('/products/:id', (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  const existing = products.byId(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'That product no longer exists.' });
    return;
  }
  // Carry the sync-owned fields through untouched — the edit form does not show
  // them, so submitting it must not reset them.
  res.json({
    product: products.upsert({
      ...parsed.data,
      id: req.params.id,
      isListed: existing.isListed,
      stockTracked: existing.stockTracked,
      stockAvailable: existing.stockAvailable,
    }),
  });
});

adminRouter.delete('/products/:id', (req, res) => {
  if (!products.remove(req.params.id)) {
    res.status(404).json({ error: 'That product no longer exists.' });
    return;
  }
  res.json({ ok: true });
});

adminRouter.get('/services', (_req, res) => res.json({ services: services.all() }));

adminRouter.post('/services', (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  const service: Service = { ...parsed.data, id: parsed.data.id || `svc-${newId().slice(0, 8)}` };
  res.status(201).json({ service: services.upsert(service) });
});

adminRouter.put('/services/:id', (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  if (!services.byId(req.params.id)) {
    res.status(404).json({ error: 'That service no longer exists.' });
    return;
  }
  res.json({ service: services.upsert({ ...parsed.data, id: req.params.id }) });
});

adminRouter.delete('/services/:id', (req, res) => {
  if (!services.remove(req.params.id)) {
    res.status(404).json({ error: 'That service no longer exists.' });
    return;
  }
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- discounts */

adminRouter.get('/discounts', (_req, res) => res.json({ discounts: discounts.all() }));

adminRouter.post('/discounts', (req, res) => {
  const parsed = discountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  if (parsed.data.type === 'percentage' && parsed.data.value > 100) {
    res.status(400).json({
      error: 'A percentage discount cannot exceed 100%.',
      fields: { value: 'Must be 100 or less.' },
    });
    return;
  }
  if (discounts.findActive(parsed.data.code)) {
    res.status(409).json({
      error: 'That discount code already exists.',
      fields: { code: 'Already in use.' },
    });
    return;
  }
  res.status(201).json({
    discount: discounts.create({ id: newId(), ...parsed.data }),
  });
});

adminRouter.delete('/discounts/:id', (req, res) => {
  if (!discounts.remove(req.params.id)) {
    res.status(404).json({ error: 'That discount code no longer exists.' });
    return;
  }
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- orders */

adminRouter.get('/orders', (_req, res) => res.json({ orders: orders.all() }));

adminRouter.patch('/orders/:id/status', async (req, res) => {
  const parsed = z
    .object({
      orderStatus: z
        .enum(['pending_payment', 'processing', 'ready_for_dispatch', 'in_transit', 'delivered', 'cancelled'])
        .optional(),
      paymentStatus: z.enum(['unpaid', 'awaiting_payment', 'paid', 'failed', 'refunded']).optional(),
      /**
       * Cancel here even though the warehouse has already packed or shipped the
       * goods. Deliberately explicit: the stock does not come back, and somebody
       * still has to raise a return or a credit note.
       */
      force: z.boolean().optional(),
    })
    .safeParse(req.body);

  if (!parsed.success || (!parsed.data.orderStatus && !parsed.data.paymentStatus)) {
    res.status(400).json({ error: 'Please provide a valid status.' });
    return;
  }
  const existing = orders.byId(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'That order no longer exists.' });
    return;
  }

  // CANCELLING IS ASKED OF THE WAREHOUSE FIRST, and only recorded here if it
  // agrees. A sales order that has been packed or shipped cannot be voided —
  // the goods are gone — and marking the order cancelled here regardless would
  // tell the customer their order was cancelled while it sat in a van, with the
  // stock still committed and nobody aware a credit note was needed.
  //
  // Only when the inventory system is *unreachable* do we cancel anyway: an
  // outage there must not stop staff cancelling an order. The release is queued
  // and the worker keeps trying.
  const isCancelling = parsed.data.orderStatus === 'cancelled' && existing.orderStatus !== 'cancelled';
  if (isCancelling && inventoryConfigured && existing.inventoryStatus === 'sent' && !parsed.data.force) {
    const result = await attemptVoid(existing);
    if (result.outcome === 'refused') {
      res.status(409).json({
        error:
          `The warehouse cannot cancel this order: ${result.reason} ` +
          'Raise a return or a credit note in the inventory system, then cancel here with Force.',
        needsForce: true,
        reason: result.reason,
      });
      return;
    }
  }

  // `markPaid` also advances the order out of pending_payment and stamps paid_at,
  // which a bare status write would skip.
  if (parsed.data.paymentStatus === 'paid') {
    orders.markPaid(req.params.id);
  } else if (parsed.data.paymentStatus) {
    orders.setPaymentStatus(req.params.id, parsed.data.paymentStatus);
  }
  if (parsed.data.orderStatus) orders.setOrderStatus(req.params.id, parsed.data.orderStatus);

  if (isCancelling) {
    // Re-read: the void above may already have marked it released, and a forced
    // cancellation still needs its state recorded rather than left at 'none'.
    const cancelled = orders.byId(req.params.id);
    if (cancelled && cancelled.inventoryVoidStatus === 'none') queueVoid(cancelled);
  }

  res.json({ order: orders.byId(req.params.id) });
});

/** Books the courier for an order that was quoted with Lalamove. */
adminRouter.post('/orders/:id/dispatch', async (req, res) => {
  const order = orders.byId(req.params.id);
  if (!order) {
    res.status(404).json({ error: 'That order no longer exists.' });
    return;
  }
  if (order.delivery.provider !== 'lalamove') {
    res.status(400).json({
      error:
        'This order was not quoted through Lalamove. Dispatch it with your own fleet or book the courier manually.',
    });
    return;
  }
  if (order.courierBookingRef) {
    res.status(409).json({
      error: `This order is already booked with Lalamove (${order.courierBookingRef}). Booking again would send a second rider.`,
    });
    return;
  }

  // The quotation captured at checkout is long expired by now, so this re-quotes
  // against the same vehicle and books the fresh one.
  const result = await bookLalamoveDelivery(order.address, order.delivery.serviceCode);
  if (!result.ok) {
    res.status(502).json({ error: result.reason });
    return;
  }

  orders.setCourierBooking(order.id, result.booking.bookingRef, result.booking.trackingUrl);
  orders.setOrderStatus(order.id, 'in_transit');

  // The customer's delivery fee carries a margin over the courier's quotation,
  // precisely so a rate that moves between checkout and dispatch is absorbed.
  // So the question worth reporting is not "did the price change" — it always
  // changes a little — but "did the buffer hold". Only a shortfall is a warning;
  // the rest is bookkeeping staff may want to see.
  const paid = order.deliveryFee;
  const courierCost = result.booking.fee;
  const margin = Math.round((paid - courierCost) * 100) / 100;

  if (margin < 0) {
    console.warn(
      `Lalamove charged ${courierCost} for ${order.reference} but the customer paid ${paid} — ` +
        `short by ${Math.abs(margin).toFixed(2)}. Consider raising COURIER_QUOTE_MARKUP_PERCENT.`,
    );
  }

  res.json({
    order: orders.byId(order.id),
    courierFee: courierCost,
    quotedFee: paid,
    margin,
    ...(margin < 0
      ? {
          notice:
            `Lalamove charged ${courierCost.toFixed(2)} but this order collected ` +
            `${paid.toFixed(2)} for delivery — ${Math.abs(margin).toFixed(2)} short. ` +
            'The buffer did not cover the surcharge on this one.',
        }
      : {}),
  });
});

/* -------------------------------------------------------- inventory system */

/** Orders that have not reached the warehouse, so staff can see and act. */
adminRouter.get('/inventory/backlog', (_req, res) => {
  res.json({
    configured: inventoryConfigured,
    counts: orders.inventoryCounts(),
    orders: orders.pushBacklog(),
  });
});

/** Proves the link and key work, without writing anything. */
adminRouter.get('/inventory/ping', async (_req, res) => {
  if (!inventoryConfigured) {
    res.status(503).json({
      error: 'The inventory system link is not configured. Set INVENTORY_API_URL and INVENTORY_API_KEY.',
    });
    return;
  }
  try {
    const result = await inventoryPing();
    res.json(result);
  } catch (error) {
    res.status(502).json({
      error: error instanceof InventoryError ? error.message : 'Could not reach the inventory system.',
    });
  }
});

/** Retries one order immediately, ignoring its backoff. */
adminRouter.post('/inventory/orders/:id/retry', async (req, res) => {
  const result = await retryPush(req.params.id);
  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }
  res.json({ order: orders.byId(req.params.id) });
});

/** Works through everything currently due, rather than waiting for the timer. */
adminRouter.post('/inventory/drain', async (_req, res) => {
  if (!inventoryConfigured) {
    res.status(503).json({ error: 'The inventory system link is not configured.' });
    return;
  }
  // Staff asked for this explicitly, so ignore any retry timer still running.
  await drainQueue({ ignoreBackoff: true });
  res.json({ counts: orders.inventoryCounts(), orders: orders.pushBacklog() });
});

/**
 * Works out what a catalog sync would change, without writing anything.
 *
 * Exists because a wrong VAT setting is a 12% error across every price in the
 * shop. Staff should see that before customers are charged it.
 */
adminRouter.get('/inventory/catalog/preview', async (_req, res) => {
  res.json(await syncCatalog({ dryRun: true }));
});

adminRouter.post('/inventory/catalog/sync', async (_req, res) => {
  res.json(await syncCatalog());
});

/* ------------------------------------------------------------------- quotes */

adminRouter.get('/quotes', (_req, res) => res.json({ quotes: quotes.all() }));

adminRouter.patch('/quotes/:id/status', (req, res) => {
  const parsed = quoteStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide a valid status.' });
    return;
  }
  if (!quotes.setStatus(req.params.id, parsed.data.status)) {
    res.status(404).json({ error: 'That quotation no longer exists.' });
    return;
  }
  res.json({ ok: true });
});

/* ----------------------------------------------------------------- bookings */

adminRouter.get('/bookings', (_req, res) => res.json({ bookings: bookings.all() }));

adminRouter.patch('/bookings/:id/status', (req, res) => {
  const parsed = bookingStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide a valid status.' });
    return;
  }
  if (!bookings.setStatus(req.params.id, parsed.data.status)) {
    res.status(404).json({ error: 'That booking no longer exists.' });
    return;
  }
  res.json({ booking: bookings.byId(req.params.id) });
});

/** Records a down payment that was settled offline (cash, over-the-counter). */
adminRouter.post('/bookings/:id/deposit-paid', (req, res) => {
  if (!bookings.byId(req.params.id)) {
    res.status(404).json({ error: 'That booking no longer exists.' });
    return;
  }
  bookings.markDepositPaid(req.params.id);
  res.json({ booking: bookings.byId(req.params.id) });
});

/* ------------------------------------------------------ calendar management */

adminRouter.get('/blocked-dates', (_req, res) => res.json({ blockedDates: blockedDates.all() }));

adminRouter.post('/blocked-dates', (req, res) => {
  const parsed = blockDateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  blockedDates.block(parsed.data.date, parsed.data.reason);
  res.status(201).json({ ok: true });
});

adminRouter.delete('/blocked-dates/:date', (req, res) => {
  if (!blockedDates.unblock(req.params.date)) {
    res.status(404).json({ error: 'That date is not blocked.' });
    return;
  }
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ reviews */

adminRouter.get('/reviews', (_req, res) => res.json({ reviews: reviews.all() }));

adminRouter.patch('/reviews/:id', (req, res) => {
  const parsed = z.object({ published: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide a valid value.' });
    return;
  }
  if (!reviews.setPublished(req.params.id, parsed.data.published)) {
    res.status(404).json({ error: 'That review no longer exists.' });
    return;
  }
  res.json({ ok: true });
});

adminRouter.delete('/reviews/:id', (req, res) => {
  if (!reviews.remove(req.params.id)) {
    res.status(404).json({ error: 'That review no longer exists.' });
    return;
  }
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ exports */

/** Escapes a value for CSV, guarding against spreadsheet formula injection. */
function csvCell(value: unknown): string {
  const text = String(value ?? '');
  // A leading =, +, - or @ is executed as a formula by Excel and Sheets.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvResponse(res: Response, filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel opens UTF-8 peso signs correctly.
  res.send(`﻿${csv}`);
}

adminRouter.get('/export/orders.csv', (_req, res) => {
  csvResponse(
    res,
    `hds-orders-${new Date().toISOString().slice(0, 10)}.csv`,
    [
      'Reference', 'Date', 'Customer', 'Institution', 'Email', 'Phone', 'Items',
      'Subtotal', 'Discount', 'Delivery fee', 'VAT', 'Processing fee', 'Total',
      'Payment method', 'Payment status', 'Order status', 'Delivery', 'Address',
    ],
    orders.all().map((o) => [
      o.reference, o.createdAt, o.customerName, o.institutionName ?? '', o.email, o.phone,
      o.items.map((i) => `${i.name} x${i.quantity}`).join(' | '),
      o.subtotal, o.discountAmount, o.deliveryFee, o.vat, o.processingFee, o.total,
      o.paymentMethod, o.paymentStatus, o.orderStatus, o.delivery.label,
      [o.address.line1, o.address.barangay, o.address.city, o.address.province].filter(Boolean).join(', '),
    ]),
  );
});

adminRouter.get('/export/quotes.csv', (_req, res) => {
  csvResponse(
    res,
    `hds-quotes-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Reference', 'Date', 'Client', 'Institution', 'Email', 'Phone', 'Address', 'Urgency', 'Status', 'Items', 'Total', 'Instructions'],
    quotes.all().map((q) => [
      q.reference, q.createdAt, q.clientName, q.institutionName, q.email, q.phone, q.address,
      q.urgency, q.status, q.items.map((i) => `${i.name} x${i.quantity}`).join(' | '), q.total, q.instructions ?? '',
    ]),
  );
});

adminRouter.get('/export/bookings.csv', (_req, res) => {
  csvResponse(
    res,
    `hds-bookings-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Reference', 'Date booked', 'Client', 'Institution', 'Email', 'Phone', 'Service', 'Visit date', 'Time slot', 'Status', 'Estimated', 'Deposit', 'Deposit status', 'Balance', 'Area', 'Notes'],
    bookings.all().map((b) => [
      b.reference, b.createdAt, b.clientName, b.institutionName, b.email, b.phone, b.serviceName,
      b.preferredDate, b.preferredTimeSlot, b.bookingStatus, b.estimatedPrice, b.depositAmount,
      b.depositStatus, b.balanceDue, b.areaSize ?? '', b.notes ?? '',
    ]),
  );
});

/* ------------------------------------------------------------------ settings */

/** Read-only view of how the server is wired, so staff can see what is live. */
adminRouter.get('/integrations', (_req, res) => {
  res.json({
    adminPath: env.adminPath,
    siteUrl: env.siteUrl,
    depositPercent: env.bookingDepositPercent,
    slotCapacity: env.booking.slotCapacity,
    integrations: {
      payments: { name: 'PayMongo', configured: Boolean(env.paymongo.secretKey), webhook: Boolean(env.paymongo.webhookSecret) },
      email: { name: 'SMTP', configured: Boolean(env.smtp.host && env.smtp.user) },
      lalamove: { configured: Boolean(env.lalamove.apiKey && env.lalamove.apiSecret), mode: env.lalamove.baseUrl.includes('sandbox') ? 'sandbox' : 'live' },
      transportify: { configured: Boolean(env.transportify.apiKey) },
      inventory: {
        name: 'Inventory system',
        configured: inventoryConfigured,
        mode: env.inventory.pushOrders ? 'pushing orders' : 'push disabled',
      },
      zoho: { configured: env.zoho.enabled },
    },
  });
});


/* ------------------------------------------------------------- staff accounts */

/**
 * Staff accounts, and what each of them may do. Super admin only, because this
 * is the one screen that can hand somebody else the keys.
 */
adminRouter.get('/users', (_req, res) => res.json({ users: adminUsers.all() }));

adminRouter.post('/users', (req: AuthedRequest, res) => {
  const parsed = adminUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  const password = passwordSchema.safeParse(req.body.password);
  if (!password.success) {
    res.status(400).json({
      error: 'Please check the highlighted fields.',
      fields: { password: password.error.issues[0]?.message ?? 'Choose a longer password.' },
    });
    return;
  }
  if (adminUsers.credentialsFor(parsed.data.email)) {
    res.status(409).json({
      error: 'Somebody already signs in with that email address.',
      fields: { email: 'Already in use.' },
    });
    return;
  }

  const user = adminUsers.create({
    id: newId(),
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role as AdminRole,
    active: true,
    passwordHash: hashPassword(password.data),
  });
  console.info(`${req.admin?.email} created staff account ${user.email} (${user.role}).`);
  res.status(201).json({ user });
});

adminRouter.patch('/users/:id', (req: AuthedRequest, res) => {
  const parsed = adminUserSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  const target = adminUsers.byId(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'That account no longer exists.' });
    return;
  }

  const active = typeof req.body.active === 'boolean' ? req.body.active : target.active;
  const role = (parsed.data.role as AdminRole) ?? target.role;

  // An installation with no active super admin cannot manage its own accounts,
  // and the only way back in is a command on the server. So the last one cannot
  // demote or switch themselves off, however deliberately.
  const wouldRemoveLastOwner =
    target.role === 'super_admin' && (role !== 'super_admin' || !active);
  if (wouldRemoveLastOwner && adminUsers.activeSuperAdmins(target.id) === 0) {
    res.status(409).json({
      error:
        'This is the only super admin left. Promote somebody else first, or you will lock yourself out.',
    });
    return;
  }

  res.json({ user: adminUsers.update(req.params.id, { name: parsed.data.name, role, active }) });
});

/** Sets somebody's password. Also how a super admin helps a colleague who is locked out. */
adminRouter.post('/users/:id/password', (req: AuthedRequest, res) => {
  const password = passwordSchema.safeParse(req.body.password);
  if (!password.success) {
    res.status(400).json({
      error: 'Please check the highlighted fields.',
      fields: { password: password.error.issues[0]?.message ?? 'Choose a longer password.' },
    });
    return;
  }
  if (!adminUsers.byId(req.params.id)) {
    res.status(404).json({ error: 'That account no longer exists.' });
    return;
  }
  adminUsers.setPassword(req.params.id, hashPassword(password.data));
  console.info(`${req.admin?.email} reset the password for account ${req.params.id}.`);
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', (req: AuthedRequest, res) => {
  const target = adminUsers.byId(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'That account no longer exists.' });
    return;
  }
  if (target.id === req.admin?.id) {
    res.status(409).json({ error: 'You cannot delete the account you are signed in with.' });
    return;
  }
  if (target.role === 'super_admin' && adminUsers.activeSuperAdmins(target.id) === 0) {
    res.status(409).json({ error: 'This is the only super admin left. Promote somebody else first.' });
    return;
  }
  adminUsers.remove(target.id);
  console.info(`${req.admin?.email} deleted staff account ${target.email}.`);
  res.json({ ok: true });
});

/** Changing your own password needs the current one, whoever you are. */
adminRouter.post('/me/password', (req: AuthedRequest, res) => {
  const next = passwordSchema.safeParse(req.body.password);
  if (!next.success) {
    res.status(400).json({
      error: 'Please check the highlighted fields.',
      fields: { password: next.error.issues[0]?.message ?? 'Choose a longer password.' },
    });
    return;
  }
  // Proving the current password is what stops a borrowed session from locking
  // the real owner out of their own account.
  if (!req.admin || !verifyCredentials(req.admin.email, String(req.body.currentPassword ?? ''))) {
    res.status(401).json({
      error: 'That is not your current password.',
      fields: { currentPassword: 'Incorrect.' },
    });
    return;
  }
  adminUsers.setPassword(req.admin.id, hashPassword(next.data));
  res.json({ ok: true });
});

/* -------------------------------------------------------------- site settings */

/** Company details the public site displays. Super admin only. */
adminRouter.get('/settings/company', (_req, res) => {
  res.json({ settings: settingsWithDefaults() });
});

adminRouter.put('/settings/company', (req: AuthedRequest, res) => {
  const parsed = siteSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  // Everything is stored as text, including the numeric threshold — one column,
  // one type, and no surprises when it is read back.
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) values[key] = String(value);
  }
  siteSettings.putMany(values);
  console.info(`${req.admin?.email} updated the company details.`);
  res.json({ settings: settingsWithDefaults() });
});

/* -------------------------------------------------------------------- content */

adminRouter.get('/posts', (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  res.json({ posts: posts.all(type as Post['type'] | undefined) });
});

adminRouter.post('/posts', (req: AuthedRequest, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  const id = newId();
  const slug = parsed.data.slug || slugify(parsed.data.title);
  if (posts.slugTaken(slug, id)) {
    res.status(409).json({
      error: 'Another post already uses that web address.',
      fields: { slug: 'Already in use.' },
    });
    return;
  }
  const post: Post = {
    ...parsed.data,
    id,
    slug,
    // Recorded so a reader knows who is speaking, and staff can see who wrote it.
    authorName: parsed.data.authorName || req.admin?.name || '',
    createdAt: '',
    updatedAt: '',
  } as Post;
  res.status(201).json({ post: posts.upsert(post) });
});

adminRouter.put('/posts/:id', (req: AuthedRequest, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  const existing = posts.byId(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'That post no longer exists.' });
    return;
  }
  const slug = parsed.data.slug || slugify(parsed.data.title);
  if (posts.slugTaken(slug, req.params.id)) {
    res.status(409).json({
      error: 'Another post already uses that web address.',
      fields: { slug: 'Already in use.' },
    });
    return;
  }
  res.json({
    post: posts.upsert({
      ...existing,
      ...parsed.data,
      id: req.params.id,
      slug,
      authorName: parsed.data.authorName || existing.authorName,
    } as Post),
  });
});

adminRouter.delete('/posts/:id', (req, res) => {
  if (!posts.remove(req.params.id)) {
    res.status(404).json({ error: 'That post no longer exists.' });
    return;
  }
  res.json({ ok: true });
});

/**
 * Turns a title into a web address.
 *
 * Kept readable rather than random: the slug is what a customer sees and what
 * search engines index, so /news/holiday-delivery-schedule beats /news/a7f3c2.
 */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  // A title of only punctuation would otherwise produce an empty address.
  return base || `post-${newId().slice(0, 8)}`;
}
