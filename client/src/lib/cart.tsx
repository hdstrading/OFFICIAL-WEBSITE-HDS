import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem, Product } from '../types';

/**
 * The shopping cart.
 *
 * Only product ids and quantities are kept in localStorage — never prices. The
 * catalog is the source of truth for what something costs, so a price change is
 * picked up the moment the customer reloads, and a stale cart can never lock in
 * an old price. The server prices the order again from scratch at checkout.
 */

const STORAGE_KEY = 'hds_cart_v2';

type CartLines = Record<string, number>;

interface CartContextValue {
  lines: CartLines;
  items: CartItem[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
  /** Cart lines in the shape the API expects. */
  toPayload: () => { productId: string; quantity: number }[];
}

const CartContext = createContext<CartContextValue | null>(null);

function readStoredLines(): CartLines {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: CartLines = {};
    for (const [id, qty] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(qty);
      if (Number.isInteger(n) && n > 0 && n <= 10_000) out[id] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function CartProvider({
  products,
  children,
}: {
  products: Product[];
  children: React.ReactNode;
}) {
  const [lines, setLines] = useState<CartLines>(readStoredLines);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private browsing with storage disabled — the cart still works in-session.
    }
  }, [lines]);

  /**
   * Resolve lines against the live catalog. An item that has been delisted
   * simply drops out rather than breaking the cart.
   */
  const items = useMemo<CartItem[]>(() => {
    if (products.length === 0) return [];
    return Object.entries(lines)
      .map(([id, quantity]) => {
        const product = products.find((p) => p.id === id);
        return product ? { product, quantity } : null;
      })
      .filter((item): item is CartItem => item !== null);
  }, [lines, products]);

  const add = useCallback((product: Product, quantity = 1) => {
    setLines((prev) => {
      const next = Math.min(10_000, (prev[product.id] ?? 0) + quantity);
      return { ...prev, [product.id]: next };
    });
    setIsOpen(true);
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((prev) => {
      if (quantity <= 0) {
        const { [productId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: Math.min(10_000, Math.floor(quantity)) };
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((prev) => {
      const { [productId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const clear = useCallback(() => setLines({}), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      items,
      count: Object.values(lines).reduce((sum, n) => sum + n, 0),
      subtotal: items.reduce((sum, i) => sum + i.product.price * i.quantity, 0),
      isOpen,
      add,
      setQuantity,
      remove,
      clear,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toPayload: () => Object.entries(lines).map(([productId, quantity]) => ({ productId, quantity })),
    }),
    [lines, items, isOpen, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside a CartProvider');
  return context;
}
