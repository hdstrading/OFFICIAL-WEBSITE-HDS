import { env, inventoryConfigured } from '../env.js';
import { orders } from '../db.js';
import { InventoryError, pushOrder } from './inventory.js';
import type { Order } from '../types.js';

/**
 * Gets paid orders into the inventory system, eventually.
 *
 * Sending is never done on the customer's request. An order is written to our
 * own database first and marked `pending`; this worker delivers it afterwards.
 * That way the inventory system being down, slow or mid-restart cannot fail a
 * checkout or delay a payment redirect — the warehouse simply finds out a few
 * minutes later than it otherwise would.
 *
 * Delivery is at-least-once. The inventory system is idempotent on our order
 * reference, so a retry after a timeout — where the request may well have
 * succeeded — returns the original sales order instead of creating a second.
 */

/** Backoff between attempts, in minutes. Beyond the last, it stops retrying. */
const RETRY_SCHEDULE = [1, 5, 15, 60, 180, 360];

/**
 * Whether an order should reach the warehouse yet.
 *
 * Paid orders always should. Bank deposit and cash on delivery are settled by
 * staff later, so they go through immediately and carry a "not yet paid" note —
 * the warehouse needs to prepare them, and would otherwise never see them at
 * all. Anything still waiting on the payment gateway is held back, so abandoned
 * checkouts never become sales orders.
 */
export function shouldPush(order: Order): boolean {
  if (order.orderStatus === 'cancelled') return false;
  if (order.paymentStatus === 'paid') return true;
  return order.paymentMethod === 'bank_transfer' || order.paymentMethod === 'cod';
}

/**
 * Marks an order for delivery to the inventory system, and tries once straight
 * away so the common case reaches the warehouse in seconds.
 *
 * Fire-and-forget by design: callers are request handlers that must not wait.
 */
export function queueOrderPush(order: Order): void {
  if (!inventoryConfigured || !env.inventory.pushOrders) {
    orders.setInventoryStatus(
      order.id,
      'skipped',
      'The inventory system link was not enabled when this order was placed.',
    );
    return;
  }

  if (!shouldPush(order)) {
    // Left pending without a next-try time. The payment webhook calls this
    // again once the money lands, and it will qualify then.
    return;
  }

  void attemptPush(order).catch((error) => {
    console.error(`Unexpected error pushing ${order.reference}:`, error);
  });
}

/** One delivery attempt, recording whatever happens. */
async function attemptPush(order: Order): Promise<boolean> {
  try {
    const result = await pushOrder(order);
    orders.setInventorySent(order.id, result.so_number);
    console.info(
      `Order ${order.reference} → sales order ${result.so_number}` +
        (result.duplicate ? ' (already existed)' : ''),
    );
    return true;
  } catch (error) {
    const inventoryError =
      error instanceof InventoryError
        ? error
        : new InventoryError((error as Error).message, false);

    const attempts = (orders.byId(order.id)?.inventoryAttempts ?? 0) + 1;

    // A permanent failure — unknown SKU, bad key, malformed request — will fail
    // identically next time, so it stops here for a person to look at.
    const retryIn = inventoryError.permanent
      ? null
      : (RETRY_SCHEDULE[attempts - 1] ?? null);

    orders.setInventoryFailure(order.id, inventoryError.message, retryIn);

    console.warn(
      `Push of ${order.reference} failed (attempt ${attempts}): ${inventoryError.message}` +
        (retryIn ? ` — retrying in ${retryIn} min` : ' — needs attention'),
    );
    return false;
  }
}

/** Retries a single order now, ignoring its backoff. Used by the staff portal. */
export async function retryPush(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const order = orders.byId(orderId);
  if (!order) return { ok: false, error: 'That order no longer exists.' };
  if (order.inventoryStatus === 'sent') {
    return { ok: false, error: 'This order has already reached the inventory system.' };
  }
  if (!inventoryConfigured) {
    return { ok: false, error: 'The inventory system link is not configured.' };
  }

  const sent = await attemptPush(order);
  return sent ? { ok: true } : { ok: false, error: orders.byId(orderId)?.inventoryError ?? 'Failed.' };
}

/**
 * Works through the queue. Called on a timer, and by staff from the portal.
 *
 * `ignoreBackoff` is what the portal's "Send all now" passes: a person who has
 * just fixed the inventory system should not be told to wait out a retry timer
 * that was set before they fixed it.
 */
export async function drainQueue({ ignoreBackoff = false } = {}): Promise<void> {
  if (!inventoryConfigured || !env.inventory.pushOrders) return;

  const due = orders.duePushes(25, ignoreBackoff);
  if (due.length === 0) return;

  console.info(`Delivering ${due.length} order(s) to the inventory system…`);
  // Sequential on purpose. The volume is small, and one order at a time keeps
  // the inventory system's own logs readable when something goes wrong.
  for (const order of due) {
    if (!shouldPush(order)) continue;
    await attemptPush(order);
  }
}

/**
 * Starts the retry timer.
 *
 * The first run is delayed rather than immediate so a server restart during an
 * inventory outage does not fire every backlogged order at a system that is
 * still coming up.
 */
export function startInventoryWorker(): void {
  if (!inventoryConfigured) {
    console.info('Inventory system link not configured — orders will not be pushed.');
    return;
  }
  if (!env.inventory.pushOrders) {
    console.info('Inventory order push is switched off (INVENTORY_PUSH_ORDERS=false).');
    return;
  }

  const intervalMs = Math.max(1, env.inventory.retryIntervalMinutes) * 60 * 1000;

  setTimeout(() => {
    void drainQueue();
    setInterval(() => void drainQueue(), intervalMs).unref();
  }, 30_000).unref();

  console.info(
    `Inventory push enabled → ${env.inventory.apiUrl} (retrying every ${env.inventory.retryIntervalMinutes} min)`,
  );
}
