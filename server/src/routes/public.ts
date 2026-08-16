import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env, paymentsConfigured } from '../env.js';
import {
  bookings,
  discounts,
  orders,
  products,
  quotes,
  reviews,
  services,
} from '../db.js';
import {
  availabilityBetween,
  addDays,
  checkSlotBookable,
  earliestBookableDate,
  latestBookableDate,
  todayISO,
  TIME_SLOTS,
} from '../lib/availability.js';
import { quoteDeliveryOptions, resolveDeliveryOption } from '../lib/delivery.js';
import { reverseGeocode } from '../lib/geocode.js';
import {
  bookingConfirmationEmail,
  orderConfirmationEmail,
  quoteConfirmationEmail,
  reviewReceivedEmail,
} from '../lib/emails.js';
import { sendMailInBackground } from '../lib/mailer.js';
import {
  availablePaymentMethods,
  createCheckoutSession,
  createDepositCheckoutSession,
  isOnlineMethod,
  PaymentError,
} from '../lib/payments.js';
import {
  generateReference,
  money,
  newId,
  priceCart,
  PricingError,
  processingFee,
} from '../lib/pricing.js';
import { queueOrderPush } from '../lib/inventory-queue.js';
import {
  bookingInputSchema,
  checkoutSchema,
  deliveryQuoteSchema,
  fieldErrors,
  quoteInputSchema,
  reviewSchema,
} from '../validation.js';
import type { Order } from '../types.js';

export const publicRouter = Router();

/**
 * Anything that writes to the database or costs us a third-party API call is
 * rate limited per IP, so the public forms cannot be used to spam our inbox or
 * run up a courier bill.
 */
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' },
});

/**
 * Guards the lookup-by-reference routes.
 *
 * An order, quotation or booking is fetched with nothing but its reference —
 * that is what makes the emailed tracking link work without an account — so the
 * reference is the only thing standing between a stranger and a customer's name,
 * phone number and home address. Unthrottled, those references can simply be
 * enumerated until one lands.
 *
 * Deliberately tighter than the quoting limit: a person checking their own order
 * refreshes it a handful of times, whereas anything doing it hundreds of times
 * is doing something else.
 */
const lookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many lookups. Please wait a few minutes and try again.' },
});

const quoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

/**
 * Turns a validation or pricing failure into a response the form can render
 * inline. Returns true when it handled the error, so callers can bail out.
 */
function sendValidationError(res: Response, error: unknown): boolean {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(error) });
    return true;
  }
  if (error instanceof PricingError) {
    res.status(400).json({ error: error.message, fields: { [error.field]: error.message } });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------- catalog */

publicRouter.get('/catalog', (_req, res) => {
  const summaries = reviews.summaries();
  const withRatings = <T extends { id: string }>(list: T[], kind: 'product' | 'service') =>
    list.map((item) => ({
      ...item,
      rating: summaries.get(`${kind}:${item.id}`) ?? { average: 0, count: 0, distribution: [0, 0, 0, 0, 0] },
    }));

  res.json({
    // Only what the inventory system still offers. Hidden products keep their
    // reviews and order history but are not sold.
    products: withRatings(products.listed(), 'product'),
    services: withRatings(services.all(), 'service'),
  });
});

publicRouter.get('/products', (_req, res) => {
  res.json({ products: products.listed() });
});

publicRouter.get('/products/:id', (req, res) => {
  const product = products.byId(req.params.id);
  if (!product || !product.isListed) {
    res.status(404).json({ error: 'That product is no longer listed.' });
    return;
  }
  res.json({
    product,
    reviews: reviews.published('product', product.id),
    rating: reviews.summaries().get(`product:${product.id}`) ?? {
      average: 0,
      count: 0,
      distribution: [0, 0, 0, 0, 0],
    },
  });
});

publicRouter.get('/services', (_req, res) => {
  res.json({ services: services.all() });
});

publicRouter.get('/services/:id', (req, res) => {
  const service = services.byId(req.params.id);
  if (!service) {
    res.status(404).json({ error: 'That service is no longer listed.' });
    return;
  }
  res.json({
    service,
    reviews: reviews.published('service', service.id),
    rating: reviews.summaries().get(`service:${service.id}`) ?? {
      average: 0,
      count: 0,
      distribution: [0, 0, 0, 0, 0],
    },
  });
});

/* ------------------------------------------------------------------ checkout */

publicRouter.get('/payment-methods', (_req, res) => {
  res.json({ methods: availablePaymentMethods(), gatewayLive: paymentsConfigured });
});

/** Validates a discount code and returns what it is worth on the current cart. */
publicRouter.post('/discount/validate', quoteLimiter, (req, res) => {
  const schema = z.object({
    code: z.string().trim().min(1, 'Enter a discount code.').max(40),
    items: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().int().min(1) })).default([]),
  });
  try {
    const input = schema.parse(req.body);
    const priced = priceCart(input.items, input.code);
    res.json({
      valid: true,
      code: priced.discountCode,
      label: priced.discountLabel,
      discountAmount: priced.discountAmount,
    });
  } catch (error) {
    if (error instanceof PricingError) {
      res.status(400).json({ valid: false, error: error.message });
      return;
    }
    if (sendValidationError(res, error)) return;
    throw error;
  }
});

/**
 * Turns a pin the customer dropped back into a written address.
 *
 * Rate limited like the other paid lookups: this spends real money per call and
 * is reachable without signing in.
 */
publicRouter.post('/geocode/reverse', quoteLimiter, async (req, res, next) => {
  try {
    const input = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
      })
      .parse(req.body);

    const found = await reverseGeocode(input.lat, input.lng);
    // Not an error: geocoding may be unconfigured, or the pin may be in the sea.
    // The customer simply keeps typing.
    res.json({ address: found });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    next(error);
  }
});

/** Delivery choices and prices for a cart going to a given address. */
publicRouter.post('/delivery/quote', quoteLimiter, async (req, res, next) => {
  try {
    const input = deliveryQuoteSchema.parse(req.body);
    const priced = priceCart(input.items, null);
    const options = await quoteDeliveryOptions(priced.subtotal, input.address);
    res.json({ options, subtotal: priced.subtotal });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    next(error);
  }
});

/** Places an order and, for online methods, returns the URL to pay at. */
publicRouter.post('/orders', writeLimiter, async (req, res, next) => {
  try {
    const input = checkoutSchema.parse(req.body);
    const priced = priceCart(input.items, input.discountCode || null);

    const delivery = await resolveDeliveryOption(
      priced.subtotal,
      input.address,
      input.deliveryProvider,
      input.deliveryServiceCode,
    );
    if (!delivery) {
      res.status(400).json({
        error: 'That delivery option is no longer available. Please choose another.',
        fields: { deliveryProvider: 'Please choose a delivery option again.' },
      });
      return;
    }

    // The gateway takes its cut of everything it collects, delivery included, so
    // the fee is worked out on the full payable amount rather than on goods alone.
    const payable = money(priced.goodsTotal + delivery.fee);
    const fee = processingFee(input.paymentMethod, payable);

    // Cash on delivery is capped — our riders do not carry large amounts.
    const total = money(payable + fee);
    if (input.paymentMethod === 'cod' && total > 20_000) {
      res.status(400).json({
        error: 'Cash on delivery is only available for orders up to ₱20,000. Please choose another payment method.',
        fields: { paymentMethod: 'Not available for this order value.' },
      });
      return;
    }
    if (input.paymentMethod === 'cod' && delivery.provider === 'pickup') {
      res.status(400).json({
        error: 'Cash on delivery does not apply to warehouse pickup — you pay when you collect.',
        fields: { paymentMethod: 'Choose another payment method for pickup.' },
      });
      return;
    }
    if (isOnlineMethod(input.paymentMethod) && !paymentsConfigured) {
      res.status(400).json({
        error: 'Online payments are temporarily unavailable. Please choose bank transfer or cash on delivery.',
        fields: { paymentMethod: 'Temporarily unavailable.' },
      });
      return;
    }

    // Stock is taken here, immediately before the order is written, and taken
    // atomically. Checking availability during pricing is not enough on its own:
    // nothing wrote the figure back, so the same units could be sold repeatedly
    // until the next catalogue sync corrected the mirror.
    const reserved = products.reserveStock(priced.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));
    if (!reserved.ok) {
      res.status(409).json({
        error:
          reserved.available <= 0
            ? `${reserved.name} sold out while you were checking out. Please remove it and try again.`
            : `Only ${reserved.available} of ${reserved.name} are left. Please reduce the quantity and try again.`,
        fields: { items: 'Please adjust your cart.' },
      });
      return;
    }

    const order: Order = {
      id: newId(),
      reference: generateReference('ORD'),
      customerName: input.customerName,
      institutionName: input.institutionName || undefined,
      email: input.email,
      phone: input.phone,
      items: priced.items,
      address: input.address,
      delivery,
      paymentMethod: input.paymentMethod,
      paymentStatus: isOnlineMethod(input.paymentMethod) ? 'awaiting_payment' : 'unpaid',
      orderStatus: isOnlineMethod(input.paymentMethod) ? 'pending_payment' : 'processing',
      notes: input.notes || undefined,
      discountCode: priced.discountCode,
      subtotal: priced.subtotal,
      discountAmount: priced.discountAmount,
      deliveryFee: delivery.fee,
      vat: priced.vat,
      processingFee: fee,
      total,
      createdAt: new Date().toISOString(),
      // Set properly by queueOrderPush below, once we know whether this order
      // is payable now or waiting on the gateway.
      inventoryStatus: 'pending',
      inventoryAttempts: 0,
      inventoryVoidStatus: 'none',
    };

    orders.insert(order);

    // Only start a gateway session for methods the gateway settles.
    if (isOnlineMethod(order.paymentMethod)) {
      try {
        const session = await createCheckoutSession(order);
        orders.setPaymentSession(order.id, session.id, session.url);
        order.paymentReference = session.id;
        order.paymentUrl = session.url;
      } catch (error) {
        // The order is already saved, so nothing is lost — the customer can pay
        // from the order page once the gateway recovers.
        console.error('Checkout session failed for', order.reference, (error as Error).message);
        if (error instanceof PaymentError) {
          res.status(502).json({
            error: `${error.message} Your order ${order.reference} has been saved — our team will contact you with payment details.`,
            order: { reference: order.reference },
          });
          return;
        }
        throw error;
      }
    }

    // Bank transfer and cash on delivery reach the warehouse now; card and
    // e-wallet orders wait for the payment webhook.
    queueOrderPush(order);

    sendMailInBackground({
      to: order.email,
      subject: `Your HDS Trading order ${order.reference}`,
      html: orderConfirmationEmail(order, 'customer'),
    });
    sendMailInBackground({
      to: env.notifyEmail,
      subject: `[Order] ${order.reference} — ${order.customerName}`,
      html: orderConfirmationEmail(order, 'staff'),
      replyTo: order.email,
    });

    res.status(201).json({ order });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    next(error);
  }
});

/** Order status lookup. The reference is unguessable, so it acts as the key. */
publicRouter.get('/orders/:reference', lookupLimiter, (req, res) => {
  const order = orders.byReference(req.params.reference);
  if (!order) {
    res.status(404).json({ error: 'We could not find that order reference.' });
    return;
  }
  res.json({ order });
});

/* --------------------------------------------------------------------- quote */

publicRouter.post('/quotes', writeLimiter, (req, res, next) => {
  try {
    const input = quoteInputSchema.parse(req.body);
    const priced = priceCart(input.items, input.discountCode || null);

    const quote = {
      id: newId(),
      reference: generateReference('QT'),
      clientName: input.clientName,
      institutionName: input.institutionName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      items: priced.items,
      urgency: input.urgency,
      status: 'Received' as const,
      instructions: input.instructions || undefined,
      discountCode: priced.discountCode,
      subtotal: priced.subtotal,
      discountAmount: priced.discountAmount,
      vat: priced.vat,
      total: priced.goodsTotal,
      createdAt: new Date().toISOString(),
    };

    quotes.insert(quote);

    sendMailInBackground({
      to: quote.email,
      subject: `Your HDS Trading quotation request ${quote.reference}`,
      html: quoteConfirmationEmail(quote, 'customer'),
    });
    sendMailInBackground({
      to: env.notifyEmail,
      subject: `[Quote] ${quote.reference} — ${quote.institutionName}`,
      html: quoteConfirmationEmail(quote, 'staff'),
      replyTo: quote.email,
    });

    res.status(201).json({ quote });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    next(error);
  }
});

publicRouter.get('/quotes/:reference', lookupLimiter, (req, res) => {
  const quote = quotes.byReference(req.params.reference);
  if (!quote) {
    res.status(404).json({ error: 'We could not find that quotation reference.' });
    return;
  }
  res.json({ quote });
});

/* -------------------------------------------------------- booking + calendar */

/**
 * Availability for the calendar. Defaults to the next 60 days; the client can
 * ask for a specific month as it pages forward.
 */
publicRouter.get('/availability', (req, res) => {
  const schema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please provide dates as YYYY-MM-DD.' });
    return;
  }

  const from = parsed.data.from ?? todayISO();
  // Cap the window so a single request cannot ask for years of calendar.
  const requestedTo = parsed.data.to ?? addDays(from, 60);
  const to = requestedTo > addDays(from, 120) ? addDays(from, 120) : requestedTo;

  res.json({
    days: availabilityBetween(from, to),
    timeSlots: TIME_SLOTS,
    earliestDate: earliestBookableDate(),
    latestDate: latestBookableDate(),
    slotCapacity: env.booking.slotCapacity,
  });
});

publicRouter.post('/bookings', writeLimiter, async (req, res, next) => {
  try {
    const input = bookingInputSchema.parse(req.body);

    const service = services.byId(input.serviceId);
    if (!service) {
      res.status(400).json({
        error: 'That service is no longer offered.',
        fields: { serviceId: 'Please choose a service from the list.' },
      });
      return;
    }

    // Re-check against live data: the calendar the customer is looking at may
    // be minutes old, and someone else may have taken the slot since.
    const slotCheck = checkSlotBookable(input.preferredDate, input.preferredTimeSlot);
    if (!slotCheck.ok) {
      res.status(409).json({
        error: slotCheck.reason,
        fields: { preferredTimeSlot: slotCheck.reason ?? 'That slot is unavailable.' },
      });
      return;
    }

    const estimatedPrice = service.basePrice;
    const depositAmount = money((estimatedPrice * env.bookingDepositPercent) / 100);

    const booking = {
      id: newId(),
      reference: generateReference('BK'),
      clientName: input.clientName,
      institutionName: input.institutionName,
      email: input.email,
      phone: input.phone,
      serviceId: service.id,
      serviceName: service.name,
      preferredDate: input.preferredDate,
      preferredTimeSlot: input.preferredTimeSlot,
      notes: input.notes || undefined,
      areaSize: input.areaSize || undefined,
      bookingStatus: 'Confirmed' as const,
      estimatedPrice,
      createdAt: new Date().toISOString(),
      depositAmount,
      depositStatus: 'unpaid' as const,
      balanceDue: money(estimatedPrice - depositAmount),
      depositReference: null as string | null,
      depositUrl: null as string | null,
    };

    bookings.insert(booking);

    // A down payment holds the slot, but a gateway hiccup must not lose the
    // booking — so this is best-effort and the link can be regenerated later.
    if (depositAmount > 0 && paymentsConfigured) {
      try {
        const session = await createDepositCheckoutSession(booking);
        bookings.setDepositSession(booking.id, session.id, session.url);
        booking.depositReference = session.id;
        booking.depositUrl = session.url;
      } catch (error) {
        console.error('Deposit session failed for', booking.reference, (error as Error).message);
      }
    }

    sendMailInBackground({
      to: booking.email,
      subject: `Your HDS Trading booking ${booking.reference}`,
      html: bookingConfirmationEmail(booking, 'customer'),
    });
    sendMailInBackground({
      to: env.notifyEmail,
      subject: `[Booking] ${booking.reference} — ${booking.institutionName}`,
      html: bookingConfirmationEmail(booking, 'staff'),
      replyTo: booking.email,
    });

    res.status(201).json({ booking });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    next(error);
  }
});

publicRouter.get('/bookings/:reference', lookupLimiter, (req, res) => {
  const booking = bookings.byReference(req.params.reference);
  if (!booking) {
    res.status(404).json({ error: 'We could not find that booking reference.' });
    return;
  }
  res.json({ booking });
});

/** Re-issues a deposit payment link, e.g. if the first one expired. */
publicRouter.post('/bookings/:reference/deposit', writeLimiter, async (req, res, next) => {
  try {
    const booking = bookings.byReference(req.params.reference);
    if (!booking) {
      res.status(404).json({ error: 'We could not find that booking reference.' });
      return;
    }
    if (booking.depositStatus === 'paid') {
      res.status(400).json({ error: 'This down payment has already been settled. Thank you!' });
      return;
    }
    if (booking.bookingStatus === 'Cancelled') {
      res.status(400).json({ error: 'This booking has been cancelled.' });
      return;
    }
    if (!paymentsConfigured) {
      res.status(503).json({
        error: 'Online payments are temporarily unavailable. Please call our hotline to settle your down payment.',
      });
      return;
    }

    const session = await createDepositCheckoutSession(booking);
    bookings.setDepositSession(booking.id, session.id, session.url);
    res.json({ paymentUrl: session.url });
  } catch (error) {
    if (error instanceof PaymentError) {
      res.status(502).json({ error: error.message });
      return;
    }
    next(error);
  }
});

/* ------------------------------------------------------------------- reviews */

publicRouter.get('/reviews', (req, res) => {
  const subjectType = typeof req.query.type === 'string' ? req.query.type : undefined;
  const subjectId = typeof req.query.id === 'string' ? req.query.id : undefined;
  res.json({
    reviews: reviews.published(subjectType, subjectId),
    summaries: Object.fromEntries(reviews.summaries()),
  });
});

/**
 * Anyone can leave feedback, but nothing appears on the site until staff
 * publish it. A matching order or booking reference marks the review verified.
 */
publicRouter.post('/reviews', writeLimiter, (req, res, next) => {
  try {
    const input = reviewSchema.parse(req.body);

    const subject =
      input.subjectType === 'product' ? products.byId(input.subjectId) : services.byId(input.subjectId);
    if (!subject) {
      res.status(400).json({
        error: 'We could not find what you are reviewing.',
        fields: { subjectId: 'Please choose a product or service.' },
      });
      return;
    }

    let verified = false;
    if (input.reference) {
      const ref = input.reference.trim().toUpperCase();
      const order = orders.byReference(ref);
      const booking = bookings.byReference(ref);
      const quote = quotes.byReference(ref);
      verified = Boolean(order || booking || quote);
      if (!verified) {
        res.status(400).json({
          error: 'We could not match that reference. Leave it blank to post without it.',
          fields: { reference: 'Reference not found.' },
        });
        return;
      }
    }

    const review = {
      id: newId(),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectName: subject.name,
      authorName: input.authorName,
      institutionName: input.institutionName || undefined,
      role: input.role || undefined,
      rating: input.rating,
      comment: input.comment,
      verified,
      published: false,
      createdAt: new Date().toISOString(),
    };

    reviews.insert(review);

    sendMailInBackground({
      to: env.notifyEmail,
      subject: `[Feedback] ${review.rating}★ for ${review.subjectName}`,
      html: reviewReceivedEmail(review.authorName, review.subjectName, review.rating, review.comment),
    });

    res.status(201).json({
      review,
      message:
        'Thank you for your feedback. Our team reviews every submission before it appears on the site.',
    });
  } catch (error) {
    if (sendValidationError(res, error)) return;
    next(error);
  }
});

/* ------------------------------------------------------------------ site meta */

/** Everything the front end needs to render contact details and options. */
publicRouter.get('/site-info', (_req, res) => {
  res.json({
    siteUrl: env.siteUrl,
    freeDeliveryThreshold: 5000,
    depositPercent: env.bookingDepositPercent,
    paymentsLive: paymentsConfigured,
    /** Public by design and restricted by referrer. Blank simply hides the map. */
    mapsBrowserKey: env.googleMapsBrowserKey,
    timeSlots: TIME_SLOTS,
    counts: {
      products: products.count(),
      services: services.count(),
      reviews: reviews.count(),
    },
  });
});

/** Public discount codes, so the cart can show what is on offer. */
publicRouter.get('/promotions', (_req, res) => {
  res.json({
    promotions: discounts.all().map((d) => ({
      code: d.code,
      type: d.type,
      value: d.value,
      description: d.description,
    })),
  });
});
