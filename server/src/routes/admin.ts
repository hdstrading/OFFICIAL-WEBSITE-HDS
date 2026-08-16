import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../env.js';
import {
  blockedDates,
  bookings,
  discounts,
  orders,
  products,
  quotes,
  reviews,
  services,
} from '../db.js';
import { currentAdmin, endSession, requireAdmin, startSession, verifyCredentials } from '../auth.js';
import { bookLalamoveDelivery } from '../lib/delivery.js';
import { ping as inventoryPing, InventoryError } from '../lib/inventory.js';
import { attemptVoid, drainQueue, queueVoid, retryPush } from '../lib/inventory-queue.js';
import { syncCatalog } from '../lib/inventory-catalog.js';
import { inventoryConfigured } from '../env.js';
import { newId } from '../lib/pricing.js';
import {
  blockDateSchema,
  bookingStatusSchema,
  discountSchema,
  fieldErrors,
  loginSchema,
  productSchema,
  quoteStatusSchema,
  serviceSchema,
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

adminRouter.post('/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please enter your email and password.' });
    return;
  }
  if (!verifyCredentials(parsed.data.email, parsed.data.password)) {
    // Deliberately vague — do not reveal which half was wrong.
    res.status(401).json({ error: 'Those credentials do not match our records.' });
    return;
  }
  const expiresAt = startSession(res, parsed.data.email.trim().toLowerCase());
  res.json({ email: parsed.data.email.trim().toLowerCase(), expiresAt });
});

adminRouter.post('/logout', (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

/** Lets the admin app decide whether to show the login screen on load. */
adminRouter.get('/me', (req, res) => {
  const email = currentAdmin(req);
  if (!email) {
    res.status(401).json({ error: 'Not signed in.' });
    return;
  }
  res.json({ email });
});

// Everything below requires a valid session.
adminRouter.use(requireAdmin);

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
  if (order.delivery.provider !== 'lalamove' || !order.delivery.quotationId) {
    res.status(400).json({
      error:
        'This order was not quoted through Lalamove. Dispatch it with your own fleet or book the courier manually.',
    });
    return;
  }

  const booking = await bookLalamoveDelivery(order.delivery.quotationId, order.address);
  if (!booking) {
    res.status(502).json({
      error:
        'Lalamove could not accept the booking — the quotation may have expired. Re-quote or book manually in the Lalamove app.',
    });
    return;
  }

  orders.setCourierBooking(order.id, booking.bookingRef, booking.trackingUrl);
  orders.setOrderStatus(order.id, 'in_transit');
  res.json({ order: orders.byId(order.id) });
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
