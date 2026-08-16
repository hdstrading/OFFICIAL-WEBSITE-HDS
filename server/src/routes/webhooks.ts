import { Router, raw } from 'express';
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
