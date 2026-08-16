import crypto from 'node:crypto';
import { Router, json, raw, type Request, type Response } from 'express';
import { bookings, orders } from '../db.js';
import { env } from '../env.js';
import { bookingConfirmationEmail, orderConfirmationEmail } from '../lib/emails.js';
import { sendMailInBackground } from '../lib/mailer.js';
import { parseWebhookEvent, verifyWebhookSignature } from '../lib/payments.js';
import { queueOrderPush } from '../lib/inventory-queue.js';

export const webhookRouter = Router();

/**
 * The only place an order or a deposit is marked paid.
 *
 * Landing on the success page proves nothing — a customer can navigate there
 * directly. Payment is recorded here, and only after the gateway's signature
 * over the raw request body checks out.
 *
 * `express.raw` is mounted on this route specifically: the signature covers the
 * exact bytes sent, so the body must not be parsed and re-serialised first.
 */
webhookRouter.post('/paymongo', raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const signature = req.header('paymongo-signature');
  if (!signature) {
    res.status(400).json({ error: 'Missing signature.' });
    return;
  }

  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody) || !verifyWebhookSignature(signature, rawBody)) {
    console.warn('Rejected PayMongo webhook with an invalid signature.');
    res.status(401).json({ error: 'Invalid signature.' });
    return;
  }

  const event = parseWebhookEvent(rawBody);
  if (!event) {
    res.status(400).json({ error: 'Malformed payload.' });
    return;
  }

  // Acknowledge before doing any work: the gateway retries on a slow response,
  // and every handler below is idempotent anyway.
  res.json({ received: true });

  const isSuccess =
    event.type === 'checkout_session.payment.paid' ||
    event.type === 'payment.paid' ||
    event.type === 'link.payment.paid';

  if (!isSuccess || !event.reference) return;

  const order = orders.byReference(event.reference);
  if (order) {
    // markPaid returns false when this event has already been applied, so a
    // retry does not send the customer a second confirmation.
    if (orders.markPaid(order.id)) {
      const paid = orders.byReference(event.reference)!;
      console.info(`Order ${paid.reference} marked paid.`);

      // Now that the money has landed, the warehouse can have it. Idempotent
      // on our reference, so an order already sent as COD is not duplicated.
      queueOrderPush(paid);
      sendMailInBackground({
        to: paid.email,
        subject: `Payment received for order ${paid.reference}`,
        html: orderConfirmationEmail(paid, 'customer'),
      });
      sendMailInBackground({
        to: env.notifyEmail,
        subject: `[Paid] Order ${paid.reference} — ${paid.customerName}`,
        html: orderConfirmationEmail(paid, 'staff'),
        replyTo: paid.email,
      });
    }
    return;
  }

  const booking = bookings.byReference(event.reference);
  if (booking && bookings.markDepositPaid(booking.id)) {
    const paid = bookings.byReference(event.reference)!;
    console.info(`Booking deposit ${paid.reference} marked paid.`);
    sendMailInBackground({
      to: paid.email,
      subject: `Down payment received for booking ${paid.reference}`,
      html: bookingConfirmationEmail(paid, 'customer'),
    });
    sendMailInBackground({
      to: env.notifyEmail,
      subject: `[Deposit paid] Booking ${paid.reference} — ${paid.institutionName}`,
      html: bookingConfirmationEmail(paid, 'staff'),
      replyTo: paid.email,
    });
  }
});

/**
 * Driver progress from Lalamove.
 *
 * WHAT AUTHENTICATES THIS. Not a signature — Lalamove's v3 webhooks are not
 * signed the way the payment gateway's are, so there is nothing to verify a
 * body against. Two things stand in for it:
 *
 *   1. The URL carries a secret segment, so the endpoint cannot be found by
 *      guessing. Configured as LALAMOVE_WEBHOOK_TOKEN; without it the route
 *      refuses to run at all rather than sitting open.
 *   2. The handler only ever acts on a booking reference it created itself.
 *      An update naming an order we did not book is acknowledged and ignored.
 *
 * NOTHING HERE TOUCHES MONEY. The worst a forged request could achieve, having
 * first guessed both the URL and a live Lalamove order id, is to move one
 * order's delivery status — never a total, a payment or a stock figure.
 *
 * Always answers 200 once the token is right. A courier that gets an error
 * retries, then eventually disables the webhook; an event we have no use for is
 * not an error, it is simply not interesting.
 */
/**
 * Checks the secret segment, answering the caller itself when it does not match.
 *
 * Returns true when the request may proceed. The distinction between the two
 * failures is deliberate and is what makes a misconfiguration diagnosable from
 * the outside: 503 means the server has no token set, 404 means the token in
 * the URL is not the one configured.
 */
function lalamoveTokenOk(req: Request, res: Response): boolean {
  const expected = env.lalamove.webhookToken;
  if (!expected) {
    console.warn(
      `Lalamove webhook called at ${req.originalUrl} but LALAMOVE_WEBHOOK_TOKEN is not set. ` +
        'Set it in .env and restart.',
    );
    res.status(503).json({ error: 'Not configured.' });
    return false;
  }
  // Constant-time: comparing directly would leak the token a byte at a time.
  const provided = String(req.params.token ?? '');
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    console.warn(
      'Rejected a Lalamove webhook: the token in the URL does not match ' +
        'LALAMOVE_WEBHOOK_TOKEN. Check the URL registered in the Partner Portal.',
    );
    res.status(404).json({ error: 'Not found.' });
    return false;
  }
  return true;
}

/**
 * Answers the Partner Portal's reachability check.
 *
 * Lalamove verifies a webhook URL before it will save it, and reports anything
 * other than a 200 as "Non-200 status code received" without saying what it
 * sent. A POST-only endpoint fails that check while being perfectly capable of
 * receiving events, so the same path answers a plain GET too. It reports
 * nothing about any order — it exists to say "yes, something is listening here".
 */
webhookRouter.get('/lalamove/:token', (req, res) => {
  if (!lalamoveTokenOk(req, res)) return;
  res.json({ ok: true, endpoint: 'lalamove', listening: true });
});

webhookRouter.post('/lalamove/:token', json({ limit: '256kb' }), (req, res) => {
  if (!lalamoveTokenOk(req, res)) return;

  res.json({ received: true });

  const body = (req.body ?? {}) as {
    eventType?: string;
    data?: { order?: { orderId?: string; status?: string; shareLink?: string } };
    // Older payload shapes put these at the top level.
    orderId?: string;
    status?: string;
  };

  const bookingRef = body.data?.order?.orderId ?? body.orderId;
  const status = String(body.data?.order?.status ?? body.status ?? '').toUpperCase();
  if (!bookingRef || !status) return;

  const order = orders.byCourierRef(bookingRef);
  if (!order) {
    // Not ours, or a booking made by hand in their app. Nothing to do.
    return;
  }

  applyLalamoveStatus(order.id, order.reference, status, body.data?.order?.shareLink);
});

/**
 * Lalamove's driver states, mapped onto what the customer is told.
 *
 * `ASSIGNING_DRIVER` is deliberately not "on the way": nobody has picked the
 * goods up yet, and telling a customer their order is in transit while it sits
 * on the packing bench is the kind of small lie that produces a phone call.
 */
function applyLalamoveStatus(
  orderId: string,
  reference: string,
  status: string,
  shareLink?: string,
): void {
  // The courier gave up or the driver cancelled. The goods are still ours and
  // still here, so the booking is released and the order goes back into the
  // dispatch queue — leaving it "in transit" would strand it silently.
  if (['CANCELED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(status)) {
    orders.clearCourierBooking(orderId);
    orders.setOrderStatus(orderId, 'ready_for_dispatch');
    console.warn(
      `Lalamove ${status.toLowerCase()} the booking for ${reference}. ` +
        'It is back in the dispatch queue and needs re-booking.',
    );
    return;
  }

  const mapped: Record<string, 'ready_for_dispatch' | 'in_transit' | 'delivered'> = {
    ASSIGNING_DRIVER: 'ready_for_dispatch',
    ON_GOING: 'in_transit',
    PICKED_UP: 'in_transit',
    COMPLETED: 'delivered',
  };
  const next = mapped[status];
  if (!next) return;

  // Only the link — passing an empty reference here would erase the booking id
  // this order is found by, and every later event for it would be ignored.
  if (shareLink) orders.setCourierTrackingUrl(orderId, shareLink);

  // Forward only: the warehouse is reporting on the same order and the two see
  // different halves of the journey.
  if (orders.advanceOrderStatus(orderId, next)) {
    console.info(`Order ${reference}: ${next} (Lalamove says ${status}).`);
  }
}
