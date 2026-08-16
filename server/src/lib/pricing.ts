import crypto from 'node:crypto';
import { discounts, products } from '../db.js';
import { env } from '../env.js';
import { buildSiteInfo } from './site-info.js';
import type { DiscountCode, OrderItem, PaymentMethod } from '../types.js';

/** Standard Philippine VAT. Prices in the catalog are VAT-exclusive. */
export const VAT_RATE = 0.12;

/**
 * Orders at or above this subtotal ship free on our own trucks.
 *
 * Read fresh each time rather than captured at start-up: the super admin can
 * change it from the portal, and a change that only takes effect after a
 * restart is the kind of thing that gets forgotten and then surprises somebody.
 */
export const freeDeliveryThreshold = () => buildSiteInfo().delivery.freeThreshold;

/** Round to centavos so totals never drift by floating-point dust. */
export const money = (value: number) => Math.round(value * 100) / 100;

export function generateReference(prefix: 'ORD' | 'QT' | 'BK'): string {
  const year = new Date().getFullYear();
  /**
   * The reference is a capability, not just a label: anyone holding it can read
   * that order's name, phone number and delivery address, because that is what
   * makes an emailed tracking link work without an account.
   *
   * Six hex characters is 24 bits — about 17 million, which sounds ample until
   * you consider that a guess only has to hit *any* order, so the odds improve
   * with every sale. Ten characters is 40 bits, a million times harder, and
   * still short enough to read down a phone. Existing references keep working;
   * this only applies to new ones.
   */
  const suffix = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 10);
  return `HDS-${prefix}-${year}-${suffix}`;
}

export const newId = () => crypto.randomUUID();

export interface PricedLine extends OrderItem {}

export interface PricingBreakdown {
  items: PricedLine[];
  subtotal: number;
  discountAmount: number;
  discountCode: string | null;
  discountLabel: string | null;
  vat: number;
  /** Excludes delivery; callers add the shipping fee themselves. */
  goodsTotal: number;
}

export class PricingError extends Error {
  constructor(
    message: string,
    readonly field = 'items',
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

/**
 * Rebuilds every line from the catalog in the database. Prices and names are
 * never taken from the request body, so a tampered cart cannot change what an
 * order costs.
 */
export function priceCart(
  requested: { productId: string; quantity: number }[],
  discountCodeInput?: string | null,
): PricingBreakdown {
  const items: PricedLine[] = [];

  for (const line of requested) {
    const product = products.byId(line.productId);
    if (!product || !product.isListed) {
      // Named where we can. "One of the items" leaves the customer guessing
      // which, and leaves staff nothing to look up when they are asked about it.
      // A product deleted outright has no name left to give, so that case says
      // what will actually clear it — which "please refresh" never did, because
      // the offending id lives in the browser's storage.
      throw new PricingError(
        product
          ? `${product.name} is no longer available. Please remove it from your cart and try again.`
          : 'An item in your cart is no longer sold. Emptying your cart and re-adding ' +
            'what you want will clear it.',
      );
    }
    // Checked here rather than only in the browser: the cart may have been sat
    // open for an hour, and the warehouse may have sold the last one over the
    // counter in the meantime.
    if (
      product.stockTracked &&
      product.stockAvailable !== null &&
      line.quantity > product.stockAvailable
    ) {
      throw new PricingError(
        product.stockAvailable <= 0
          ? `${product.name} has just gone out of stock. Please remove it to continue.`
          : `Only ${product.stockAvailable} of ${product.name} are left. Please reduce the quantity.`,
      );
    }
    const lineTotal = money(product.price * line.quantity);
    items.push({
      productId: product.id,
      // Captured now rather than looked up at push time: a product renamed or
      // re-SKU'd later must not change what an existing order says it was.
      sku: product.sku ?? '',
      name: product.name,
      unit: product.unit,
      unitPrice: product.price,
      quantity: line.quantity,
      lineTotal,
    });
  }

  const subtotal = money(items.reduce((sum, i) => sum + i.lineTotal, 0));

  let discount: DiscountCode | null = null;
  const code = discountCodeInput?.trim();
  if (code) {
    discount = discounts.findActive(code);
    if (!discount) {
      throw new PricingError('That discount code is not valid or has expired.', 'discountCode');
    }
  }

  let discountAmount = 0;
  if (discount) {
    discountAmount =
      discount.type === 'percentage'
        ? money(subtotal * (discount.value / 100))
        : money(discount.value);
    // A discount can never exceed the order value.
    discountAmount = money(Math.min(discountAmount, subtotal));
  }

  const net = money(subtotal - discountAmount);
  const vat = money(net * VAT_RATE);

  return {
    items,
    subtotal,
    discountAmount,
    discountCode: discount?.code ?? null,
    discountLabel: discount?.description ?? null,
    vat,
    goodsTotal: money(net + vat),
  };
}

/**
 * The gateway's cut, passed on to whoever chose to pay that way.
 *
 * Charged per method because the methods do not cost the same: cards and online
 * banking carry the heaviest gateway fees, e-wallets less. Bank deposit and cash
 * on delivery never reach the gateway at all, so they carry nothing — which also
 * leaves customers a way to avoid the fee entirely.
 *
 * Taken on the full amount payable, delivery included, because that is what the
 * gateway takes its percentage of. Not VAT-rated again: it is a pass-through of
 * a cost already incurred, not another good sold.
 */
export function processingFee(method: PaymentMethod, payable: number): number {
  const percent = env.paymentFeePercent[method] ?? 0;
  if (!percent) return 0;
  return money(payable * (percent / 100));
}

export const formatPeso = (value: number) =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
