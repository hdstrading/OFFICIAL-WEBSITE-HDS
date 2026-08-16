import { env, inventoryConfigured } from '../env.js';
import { money, VAT_RATE } from './pricing.js';
import { formatAddress } from './delivery.js';
import type { Order, OrderStatus } from '../types.js';

/**
 * Talks to the inventory system at inventory.hdstradingopc.com.
 *
 * That system owns stock, and a paid website order becomes a confirmed sales
 * order there so the warehouse can pick, pack and ship it. Its integration API
 * is idempotent on the reference we send, which is what lets us retry safely
 * after a timeout without booking the same stock twice.
 *
 * Nothing here is on a customer's critical path. Checkout completes whether or
 * not the inventory system is reachable; orders are queued and retried.
 */

export class InventoryError extends Error {
  constructor(
    message: string,
    /** False when retrying could plausibly succeed — a timeout, a 5xx, a restart. */
    readonly permanent = false,
    /**
     * The HTTP status, when the request got as far as a reply. Undefined for a
     * timeout or an unreachable host. Callers that need to tell one refusal from
     * another — a 404 "no such order" from a 409 "too late to void" — read this
     * rather than matching on the message text, which is the inventory system's
     * to reword.
     */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'InventoryError';
  }
}

/**
 * The inventory system mounts every route under `/api`, so its integration
 * endpoints live at `/api/integration/...`. Set INVENTORY_API_URL to the bare
 * host — the prefix is added here rather than being something to remember.
 */
const API_PREFIX = '/api';

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!inventoryConfigured) {
    throw new InventoryError('The inventory system link is not configured.', true);
  }

  let response: Response;
  try {
    response = await fetch(`${env.inventory.apiUrl}${API_PREFIX}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.inventory.apiKey}`,
        'X-HDS-Client': env.inventory.clientName,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(env.inventory.timeoutMs),
    });
  } catch (error) {
    // Unreachable, DNS failure, TLS failure or timeout — all worth retrying.
    throw new InventoryError(
      `Could not reach the inventory system: ${(error as Error).message}`,
      false,
    );
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    const payload = body as { error?: string; unknown_skus?: string[] };
    const detail = payload.error ?? `${response.status} ${response.statusText}`;

    // 4xx means the request itself is wrong — an unknown SKU, a bad key, a
    // shipped order we cannot void. Retrying an identical request will fail
    // identically, so these stop here and wait for a person.
    // 429 is the exception: it is a 4xx that explicitly means "try later".
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;

    throw new InventoryError(
      payload.unknown_skus?.length
        ? `Unknown SKU(s) in the inventory system: ${payload.unknown_skus.join(', ')}. ` +
          'Check the SKU on each product matches an item there.'
        : detail,
      permanent,
      response.status,
    );
  }

  return body as T;
}

/* --------------------------------------------------------------------- ping */

export interface InventoryPing {
  ok: boolean;
  system: string;
  client: string;
  warehouse_configured: boolean;
  time: string;
}

/** Health check. Used by the staff portal to prove the link and key work. */
export const ping = () => call<InventoryPing>('/integration/ping');

/* -------------------------------------------------------------------- stock */

export interface InventoryStockItem {
  sku: string;
  name: string;
  unit: string;
  tracked: boolean;
  on_hand: number | null;
  committed: number | null;
  available: number | null;
}

export const fetchStock = () =>
  call<{ ok: boolean; as_of: string; items: InventoryStockItem[] }>('/integration/stock');

/* ------------------------------------------------------------------- orders */

/**
 * Maps a website order onto the sales order payload.
 *
 * TAX. Our catalog prices exclude VAT and we add 12% at checkout, so the lines
 * are sent `exclusive` with our own unit prices — the inventory system then
 * adds the same 12% and arrives at the same figure.
 *
 * THE DISCOUNT IS GROSSED UP, and it has to be. The inventory system computes
 * tax on the pre-discount line total and subtracts the discount afterwards,
 * whereas we discount first and tax the remainder. Sending our net discount
 * would leave the sales order higher than the customer's receipt by 12% of it.
 * Multiplying by 1 + VAT makes the two totals agree exactly:
 *
 *   ours   = (subtotal − D) × 1.12 + shipping
 *   theirs = subtotal − D×1.12 + shipping + subtotal×0.12
 *          = subtotal × 1.12 − D×1.12 + shipping        ← identical
 */
export function buildSalesOrderPayload(order: Order) {
  const lines = order.items.map((item) => ({
    sku: item.sku,
    description: item.name,
    quantity: item.quantity,
    // The price the customer was actually charged, not the inventory list
    // price — the receipt is what the warehouse paperwork has to match.
    unit_price: item.unitPrice,
    tax_rate: VAT_RATE * 100,
  }));

  return {
    reference: order.reference,
    lines,
    buyer: {
      name: order.customerName,
      company: order.institutionName ?? '',
      email: order.email,
      phone: order.phone,
      address: formatAddress(order.address),
    },
    tax_mode: 'exclusive' as const,
    discount: money(order.discountAmount * (1 + VAT_RATE)),
    shipping_fee: order.deliveryFee,
    // THE GATEWAY FEE IS SENT AS AN AMOUNT, NOT A RATE. Which rate applies
    // depends on the channel the customer picked at checkout, and the website is
    // where that choice was made and shown — so it sends the exact peso figure
    // the customer agreed to and the inventory system records it verbatim. The
    // alternative, each system applying its own configured percentage, is two
    // sources of truth for one number and a receipt that eventually disagrees
    // with the invoice.
    //
    // It lands after tax on both sides: we take our percentage of the full
    // payable amount, and the inventory system adds it on top of its taxed
    // total. Sent as `processing_fee` rather than folded into shipping, which
    // would corrupt every delivery-cost report the warehouse runs.
    processing_fee: order.processingFee,
    // Recorded on the sales order, and the key their optional rate fallback
    // would use if an order ever arrived without an amount.
    payment_method: order.paymentMethod,
    delivery_method: order.delivery.label,
    payment_terms: PAYMENT_TERMS[order.paymentMethod],
    notes: buildNotes(order),
    ...(env.inventory.warehouseId ? { warehouse_id: Number(env.inventory.warehouseId) } : {}),
  };
}

const PAYMENT_TERMS: Record<Order['paymentMethod'], string> = {
  card: 'Paid online (card)',
  gcash: 'Paid online (GCash)',
  maya: 'Paid online (Maya)',
  online_banking: 'Paid online (bank transfer)',
  bank_transfer: 'Bank deposit — confirm before release',
  cod: 'Cash on delivery',
};

function buildNotes(order: Order): string {
  const parts = [
    `Website order ${order.reference}`,
    `Delivery: ${order.delivery.label} (${order.delivery.etaLabel})`,
  ];
  if (order.address.landmark) parts.push(`Landmark: ${order.address.landmark}`);
  if (order.notes) parts.push(`Customer notes: ${order.notes}`);
  if (order.paymentStatus !== 'paid') {
    parts.push('NOT YET PAID — do not release until payment is confirmed.');
  }
  return parts.join('\n');
}

/**
 * What our arithmetic says the inventory system will compute, so a mismatch is
 * caught here rather than discovered on a printed delivery note.
 */
export function expectedInventoryTotal(order: Order): number {
  const lineTotal = order.items.reduce((sum, item) => sum + money(item.unitPrice * item.quantity), 0);
  const tax = money(lineTotal * VAT_RATE);
  const discount = money(order.discountAmount * (1 + VAT_RATE));
  return money(lineTotal - discount + order.deliveryFee + order.processingFee + tax);
}

export interface SalesOrderResult {
  ok: boolean;
  duplicate: boolean;
  id: number;
  so_number: string;
  status: string;
  total?: number;
}

/**
 * Sends an order. Safe to call repeatedly for the same order — the inventory
 * system returns the existing sales order rather than creating a second one.
 */
export async function pushOrder(order: Order): Promise<SalesOrderResult> {
  const missingSku = order.items.filter((item) => !item.sku?.trim());
  if (missingSku.length) {
    throw new InventoryError(
      `No SKU set for: ${missingSku.map((i) => i.name).join(', ')}. ` +
        'Add the matching inventory SKU to each product, then retry.',
      true,
    );
  }

  const payload = buildSalesOrderPayload(order);
  const result = await call<SalesOrderResult>('/integration/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  // Warn rather than fail: the order is already in the warehouse and staff can
  // correct a total, whereas rejecting it would leave them unaware of it.
  const expected = expectedInventoryTotal(order);
  if (typeof result.total === 'number' && Math.abs(result.total - expected) > 0.01) {
    const short = money(expected - result.total);
    const looksLikeTheFee = order.processingFee > 0 && Math.abs(short - order.processingFee) <= 0.01;
    console.warn(
      `Sales order ${result.so_number} totals ${result.total} but order ${order.reference} ` +
        `was charged ${order.total} (expected ${expected}).` +
        (looksLikeTheFee
          ? ` The difference is exactly the ${money(order.processingFee)} processing fee, so this ` +
            'inventory system is not recording processing_fee — check that it is up to date.'
          : ' Check the tax and discount mapping.'),
    );
  }

  return result;
}

/* ------------------------------------------------------- status mirroring */

/** A sales order's progress, as the inventory system reports it. */
export interface InventoryOrderStatus {
  reference: string;
  so_number: string;
  /** draft | confirmed | packed | shipped | delivered | closed | void */
  status: string;
  /** Latest pick list for the order, if one exists: not_started | picking | picked | cancelled */
  pick_status: string | null;
}

/**
 * Statuses for a batch of orders. One request for everything still open rather
 * than one per order, so the poll costs the warehouse a single query.
 */
export const fetchOrderStatuses = (references: string[]) =>
  call<{ ok: boolean; as_of: string; orders: InventoryOrderStatus[] }>(
    `/integration/orders?references=${encodeURIComponent(references.join(','))}`,
  );

/**
 * Translates warehouse progress into what the customer is told.
 *
 * `confirmed` and `picked` both read as "Preparing your order": from the
 * customer's side there is no difference between an order accepted and an order
 * being walked around a warehouse, and inventing one would only invite "why has
 * it said picked for two days".
 *
 * `closed` maps to delivered because it is the state a completed order settles
 * into — treating it as unknown would make finished orders look stuck.
 *
 * Returns null for states with no customer-facing meaning, leaving the website
 * status untouched rather than inventing one.
 */
export function mapInventoryStatus(status: string): OrderStatus | null {
  switch (status) {
    // Covers picking too: a pick list exists only while the order is still
    // `confirmed`, and the customer sees the same thing throughout.
    case 'confirmed':
      return 'processing';
    case 'packed':
      return 'ready_for_dispatch';
    case 'shipped':
      return 'in_transit';
    case 'delivered':
    case 'closed':
      return 'delivered';
    case 'void':
      return 'cancelled';
    // `draft` never reaches us — the integration creates orders confirmed.
    default:
      return null;
  }
}

/** Releases the stock an order had committed. Refused once anything shipped. */
export const voidOrder = (reference: string) =>
  call<SalesOrderResult>(`/integration/orders/${encodeURIComponent(reference)}/void`, {
    method: 'POST',
  });
