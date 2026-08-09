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
  const product: Product = { ...parsed.data, id: parsed.data.id || `prod-${newId().slice(0, 8)}` };
  res.status(201).json({ product: products.upsert(product) });
});

adminRouter.put('/products/:id', (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  if (!products.byId(req.params.id)) {
    res.status(404).json({ error: 'That product no longer exists.' });
    return;
  }
  res.json({ product: products.upsert({ ...parsed.data, id: req.params.id }) });
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

adminRouter.patch('/orders/:id/status', (req, res) => {
  const parsed = z
    .object({
      orderStatus: z
        .enum(['pending_payment', 'processing', 'ready_for_dispatch', 'in_transit', 'delivered', 'cancelled'])
        .optional(),
      paymentStatus: z.enum(['unpaid', 'awaiting_payment', 'paid', 'failed', 'refunded']).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success || (!parsed.data.orderStatus && !parsed.data.paymentStatus)) {
    res.status(400).json({ error: 'Please provide a valid status.' });
    return;
  }
  if (!orders.byId(req.params.id)) {
    res.status(404).json({ error: 'That order no longer exists.' });
    return;
  }
  // `markPaid` also advances the order out of pending_payment and stamps paid_at,
  // which a bare status write would skip.
  if (parsed.data.paymentStatus === 'paid') {
    orders.markPaid(req.params.id);
  } else if (parsed.data.paymentStatus) {
    orders.setPaymentStatus(req.params.id, parsed.data.paymentStatus);
  }
  if (parsed.data.orderStatus) orders.setOrderStatus(req.params.id, parsed.data.orderStatus);

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
      'Subtotal', 'Discount', 'Delivery fee', 'VAT', 'Total',
      'Payment method', 'Payment status', 'Order status', 'Delivery', 'Address',
    ],
    orders.all().map((o) => [
      o.reference, o.createdAt, o.customerName, o.institutionName ?? '', o.email, o.phone,
      o.items.map((i) => `${i.name} x${i.quantity}`).join(' | '),
      o.subtotal, o.discountAmount, o.deliveryFee, o.vat, o.total,
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
      zoho: { configured: env.zoho.enabled },
    },
  });
});
