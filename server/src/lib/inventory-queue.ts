import { env, inventoryConfigured } from '../env.js';
import { orders } from '../db.js';
import {
  fetchOrderStatuses,
  InventoryError,
  mapInventoryStatus,
  pushOrder,
} from './inventory.js';
import { syncCatalog } from './inventory-catalog.js';
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
 * Brings warehouse progress back to the customer.
 *
 * The inventory system owns fulfilment, so it is the only thing that knows when
 * an order was packed or handed to a driver. Rather than have it call us — which
 * would mean changes to its lifecycle code and a second place for this to break
 * — the website asks, in one request covering every order still in flight.
 *
 * Only orders we actually sent are polled, and only those not yet finished:
 * a delivered or cancelled order has nowhere left to go.
 */
export async function syncOrderStatuses(): Promise<void> {
  if (!inventoryConfigured) return;

  const open = orders.awaitingFulfilment();
  if (open.length === 0) return;

  try {
    const { orders: statuses } = await fetchOrderStatuses(open.map((o) => o.reference));

    for (const remote of statuses) {
      const local = open.find((o) => o.reference === remote.reference);
      if (!local) continue;

      const mapped = mapInventoryStatus(remote.status);
      if (!mapped || mapped === local.orderStatus) continue;

      orders.setOrderStatus(local.id, mapped);
      console.info(
        `Order ${local.reference}: ${local.orderStatus} → ${mapped} ` +
          `(warehouse says ${remote.status})`,
      );
    }
  } catch (error) {
    const message = (error as Error).message;
    // A 404 means this version of the inventory system has no status endpoint
    // yet. Say so once per poll and carry on — everything else still works.
    if (error instanceof InventoryError && /404|not found|No API route/i.test(message)) {
      console.info(
        'Order status mirroring is unavailable — the inventory system has no ' +
          '/integration/orders endpoint. Orders still reach it; only progress updates are missing.',
      );
      return;
    }
    console.warn(`Could not read order statuses from the inventory system: ${message}`);
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
    void syncOrderStatuses();
    setInterval(() => {
      void drainQueue();
      void syncOrderStatuses();
    }, intervalMs).unref();
  }, 30_000).unref();

  console.info(
    `Inventory push enabled → ${env.inventory.apiUrl} (retrying every ${env.inventory.retryIntervalMinutes} min)`,
  );

  // The catalog is pulled on its own, slower schedule: prices and stock change
  // far less often than an order needs delivering.
  const syncMinutes = env.inventory.syncIntervalMinutes;
  if (syncMinutes > 0) {
    const runSync = async () => {
      const result = await syncCatalog();
      if (result.error) {
        console.warn(`Catalog sync failed: ${result.error}`);
      } else if (result.created || result.updated || result.hidden || result.relisted) {
        console.info(
          `Catalog sync: ${result.created} new, ${result.updated} updated, ` +
            `${result.relisted} relisted, ${result.hidden} hidden.`,
        );
      }
    };
    setTimeout(() => {
      void runSync();
      setInterval(() => void runSync(), syncMinutes * 60 * 1000).unref();
    }, 45_000).unref();
    console.info(`Catalog sync enabled (every ${syncMinutes} min).`);
  }
}
