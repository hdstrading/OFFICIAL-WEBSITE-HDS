import crypto from 'node:crypto';
import { discounts, products } from '../db.js';
import type { DiscountCode, OrderItem } from '../types.js';

/** Standard Philippine VAT. Prices in the catalog are VAT-exclusive. */
export const VAT_RATE = 0.12;

/** Orders at or above this subtotal ship free on our own trucks. */
export const FREE_DELIVERY_THRESHOLD = 5000;

/** Round to centavos so totals never drift by floating-point dust. */
export const money = (value: number) => Math.round(value * 100) / 100;

export function generateReference(prefix: 'ORD' | 'QT' | 'BK'): string {
  const year = new Date().getFullYear();
  // 6 random base32 characters: short enough to read over the phone, long
  // enough that references cannot be guessed or enumerated.
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
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
    if (!product) {
      throw new PricingError(
        'One of the items in your list is no longer available. Please refresh and try again.',
      );
    }
    const lineTotal = money(product.price * line.quantity);
    items.push({
      productId: product.id,
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

export const formatPeso = (value: number) =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
