import crypto from 'node:crypto';
import { env, paymentsConfigured } from '../env.js';
import type { Order, PaymentMethod } from '../types.js';

/**
 * Online card / e-wallet payments run through PayMongo, which is the gateway
 * most Philippine businesses use to accept Visa, Mastercard, GCash, Maya,
 * GrabPay and online bank transfers under one account.
 *
 * Everything here is server-side: the secret key never reaches the browser, and
 * an order is only marked paid when PayMongo tells us so over a signed webhook —
 * never because the customer landed on the success page.
 */

const API = 'https://api.paymongo.com/v1';

/** Methods PayMongo settles for us, versus the ones our staff settle by hand. */
const ONLINE_METHODS: Record<Exclude<PaymentMethod, 'bank_transfer' | 'cod'>, string> = {
  card: 'card',
  gcash: 'gcash',
  maya: 'paymaya',
  online_banking: 'dob',
};

export const isOnlineMethod = (method: PaymentMethod): method is keyof typeof ONLINE_METHODS =>
  method in ONLINE_METHODS;

export interface PaymentMethodOption {
  id: PaymentMethod;
  label: string;
  description: string;
  /** Settled instantly online, versus confirmed by our team afterwards. */
  instant: boolean;
  available: boolean;
  unavailableReason?: string;
}

/**
 * What the checkout page offers. Online methods disappear cleanly when the
 * gateway has no keys configured, rather than failing at the last step.
 */
export function availablePaymentMethods(): PaymentMethodOption[] {
  const gatewayNote = paymentsConfigured
    ? undefined
    : 'Card and e-wallet payments are being activated. Please use bank transfer or cash on delivery for now.';

  return [
    {
      id: 'card',
      label: 'Credit or Debit Card',
      description: 'Visa, Mastercard and JCB. Secured by our payment provider.',
      instant: true,
      available: paymentsConfigured,
      unavailableReason: gatewayNote,
    },
    {
      id: 'gcash',
      label: 'GCash',
      description: 'Pay from your GCash wallet. You will be redirected to confirm.',
      instant: true,
      available: paymentsConfigured,
      unavailableReason: gatewayNote,
    },
    {
      id: 'maya',
      label: 'Maya',
      description: 'Pay from your Maya wallet. You will be redirected to confirm.',
      instant: true,
      available: paymentsConfigured,
      unavailableReason: gatewayNote,
    },
    {
      id: 'online_banking',
      label: 'Online Bank Transfer',
      description: 'BPI and UnionBank direct online banking.',
      instant: true,
      available: paymentsConfigured,
      unavailableReason: gatewayNote,
    },
    {
      id: 'bank_transfer',
      label: 'Manual Bank Deposit / Transfer',
      description:
        'We email you our bank and e-wallet details. Send your proof of payment and we release your order.',
      instant: false,
      available: true,
    },
    {
      id: 'cod',
      label: 'Cash on Delivery',
      description:
        'Pay our rider on arrival. Available within Metro Manila and Rizal for orders up to ₱20,000.',
      instant: false,
      available: true,
    },
  ];
}

export class PaymentError extends Error {}

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.paymongo.secretKey}:`).toString('base64')}`;
}

/** PayMongo works in centavos. */
const toCentavos = (peso: number) => Math.round(peso * 100);

export interface CheckoutSession {
  id: string;
  url: string;
}

interface GatewayLineItem {
  name: string;
  quantity: number;
  amount: number;
  currency: 'PHP';
}

/**
 * Builds the line items shown on the gateway's payment page.
 *
 * The only thing that must always hold is that these sum to exactly what we
 * told the customer they would pay. The gateway rejects negative amounts, so a
 * discount cannot be its own line — when one applies we fall back to a single
 * line for the order total rather than listing items that add up to more than
 * we quoted.
 *
 * Quantities are folded into the name and every line sent as quantity 1, so the
 * amount we compute is the amount charged, with no per-unit rounding in
 * between.
 */
function buildLineItems(order: Order): GatewayLineItem[] {
  const expectedTotal = toCentavos(order.total);

  const summaryLine = (): GatewayLineItem[] => [
    {
      name: `HDS Trading order ${order.reference} (${order.items.length} item${
        order.items.length === 1 ? '' : 's'
      }, incl. VAT and delivery)`,
      quantity: 1,
      amount: expectedTotal,
      currency: 'PHP',
    },
  ];

  if (order.discountAmount > 0) return summaryLine();

  const itemised: GatewayLineItem[] = order.items.map((item) => ({
    name: item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name,
    quantity: 1,
    amount: toCentavos(item.lineTotal),
    currency: 'PHP',
  }));

  if (order.vat > 0) {
    itemised.push({ name: 'VAT (12%)', quantity: 1, amount: toCentavos(order.vat), currency: 'PHP' });
  }
  if (order.deliveryFee > 0) {
    itemised.push({
      name: `Delivery — ${order.delivery.label}`,
      quantity: 1,
      amount: toCentavos(order.deliveryFee),
      currency: 'PHP',
    });
  }

  // Last line of defence: if the parts do not add up to the total for any
  // reason, charge the total rather than whatever the parts happen to sum to.
  const sum = itemised.reduce((total, line) => total + line.amount, 0);
  if (sum !== expectedTotal) {
    console.warn(
      `Line items for ${order.reference} summed to ${sum} but the order total is ` +
        `${expectedTotal}; falling back to a single line.`,
    );
    return summaryLine();
  }

  return itemised;
}

/**
 * Creates a hosted checkout page for an order and returns the URL to send the
 * customer to.
 */
export async function createCheckoutSession(order: Order): Promise<CheckoutSession> {
  if (!paymentsConfigured) {
    throw new PaymentError('Online payments are not configured on this server.');
  }
  if (!isOnlineMethod(order.paymentMethod)) {
    throw new PaymentError(`${order.paymentMethod} is not settled online.`);
  }

  const lineItems = buildLineItems(order);

  const response = await fetch(`${API}/checkout_sessions`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: lineItems,
          payment_method_types: [ONLINE_METHODS[order.paymentMethod]],
          description: `HDS Trading OPC order ${order.reference}`,
          reference_number: order.reference,
          send_email_receipt: true,
          show_line_items: true,
          success_url: `${env.siteUrl}/order/${order.reference}?paid=1`,
          cancel_url: `${env.siteUrl}/checkout?cancelled=${order.reference}`,
          billing: {
            name: order.customerName,
            email: order.email,
            phone: order.phone,
          },
          metadata: { order_id: order.id, reference: order.reference },
        },
      },
    }),
  });

  const body = (await response.json()) as {
    data?: { id: string; attributes: { checkout_url: string } };
    errors?: { detail: string }[];
  };

  if (!response.ok || !body.data) {
    const detail = body.errors?.map((e) => e.detail).join('; ') ?? response.statusText;
    console.error('PayMongo checkout session failed:', detail);
    throw new PaymentError('We could not start the payment. Please try again or choose another method.');
  }

  return { id: body.data.id, url: body.data.attributes.checkout_url };
}

/**
 * Hosted checkout for a service booking's down payment. Same gateway and same
 * webhook as orders — the reference tells the two apart.
 */
export async function createDepositCheckoutSession(booking: {
  reference: string;
  id: string;
  serviceName: string;
  preferredDate: string;
  depositAmount: number;
  clientName: string;
  email: string;
  phone: string;
}): Promise<CheckoutSession> {
  if (!paymentsConfigured) {
    throw new PaymentError('Online payments are not configured on this server.');
  }

  const response = await fetch(`${API}/checkout_sessions`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            {
              name: `Down payment — ${booking.serviceName} (${booking.preferredDate})`,
              quantity: 1,
              amount: toCentavos(booking.depositAmount),
              currency: 'PHP',
            },
          ],
          payment_method_types: ['card', 'gcash', 'paymaya', 'dob'],
          description: `HDS Trading OPC booking deposit ${booking.reference}`,
          reference_number: booking.reference,
          send_email_receipt: true,
          show_line_items: true,
          success_url: `${env.siteUrl}/booking/${booking.reference}?paid=1`,
          cancel_url: `${env.siteUrl}/booking/${booking.reference}`,
          billing: { name: booking.clientName, email: booking.email, phone: booking.phone },
          metadata: { booking_id: booking.id, reference: booking.reference, kind: 'booking_deposit' },
        },
      },
    }),
  });

  const body = (await response.json()) as {
    data?: { id: string; attributes: { checkout_url: string } };
    errors?: { detail: string }[];
  };

  if (!response.ok || !body.data) {
    const detail = body.errors?.map((e) => e.detail).join('; ') ?? response.statusText;
    console.error('PayMongo deposit session failed:', detail);
    throw new PaymentError('We could not start the down payment. Please try again.');
  }

  return { id: body.data.id, url: body.data.attributes.checkout_url };
}

/**
 * Verifies a PayMongo webhook signature.
 *
 * The header looks like `t=<unix>,te=<sig>,li=<sig>`; `te` is the test-mode
 * signature and `li` the live-mode one. The signed payload is `<t>.<raw body>`.
 * Requires the raw, unparsed body — see the express.raw() mount in index.ts.
 */
export function verifyWebhookSignature(signatureHeader: string, rawBody: Buffer): boolean {
  if (!env.paymongo.webhookSecret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((segment) => {
      const [key, value] = segment.split('=');
      return [key?.trim(), value?.trim()];
    }),
  ) as { t?: string; te?: string; li?: string };

  const timestamp = parts.t;
  const provided = parts.li || parts.te;
  if (!timestamp || !provided) return false;

  // Reject anything older than five minutes so a captured request cannot be replayed.
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = crypto
    .createHmac('sha256', env.paymongo.webhookSecret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface WebhookEvent {
  type: string;
  /** Our own order reference, echoed back by the gateway. */
  reference: string | null;
  checkoutSessionId: string | null;
}

export function parseWebhookEvent(rawBody: Buffer): WebhookEvent | null {
  try {
    const payload = JSON.parse(rawBody.toString('utf8')) as {
      data?: {
        attributes?: {
          type?: string;
          data?: {
            id?: string;
            attributes?: {
              reference_number?: string;
              metadata?: { reference?: string };
              payment_intent?: { id?: string };
            };
          };
        };
      };
    };

    const envelope = payload.data?.attributes;
    const resource = envelope?.data?.attributes;
    return {
      type: envelope?.type ?? '',
      reference: resource?.reference_number ?? resource?.metadata?.reference ?? null,
      checkoutSessionId: envelope?.data?.id ?? null,
    };
  } catch {
    return null;
  }
}
