import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2, Truck, X } from 'lucide-react';
import { useCart } from '../lib/cart';
import { peso } from '../lib/format';
import { useCompany } from '../lib/company';
import { Button, EmptyState } from './ui';

/**
 * Slide-over cart. Shows the goods subtotal only — VAT and delivery are added
 * at checkout once we know where the order is going, and the drawer says so
 * rather than showing a number that will change.
 */
export default function CartDrawer() {
  const company = useCompany();
  const { items, isOpen, close, setQuantity, remove, subtotal, count } = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and focus moves into the panel so keyboard users are not
  // left behind on the page underneath.
  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  const shortfall = company.delivery.freeThreshold - subtotal;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />

      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-cyan-700" aria-hidden />
            Your cart
            {count > 0 && <span className="text-sm font-semibold text-slate-500">({count})</span>}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center">
            <EmptyState
              icon={<ShoppingBag className="h-12 w-12" />}
              title="Your cart is empty"
              description="Browse our supplies and equipment, then add what you need. You can pay online or request a formal quotation for bulk orders."
              action={
                <Link to="/products" onClick={close}>
                  <Button>Browse supplies</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="divide-y divide-slate-100">
                {items.map(({ product, quantity }) => (
                  <li key={product.id} className="py-4 flex gap-3.5">
                    <img
                      src={product.image}
                      alt=""
                      loading="lazy"
                      className="h-18 w-18 rounded-xl object-cover bg-slate-100 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/products/${product.id}`}
                        onClick={close}
                        className="text-sm font-bold text-slate-900 hover:text-cyan-700 line-clamp-2"
                      >
                        {product.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {peso(product.price)} per {product.unit}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center rounded-lg border border-slate-300">
                          <button
                            type="button"
                            onClick={() => setQuantity(product.id, quantity - 1)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-l-lg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600"
                            aria-label={`Reduce quantity of ${product.name}`}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(e) => setQuantity(product.id, Number(e.target.value))}
                            aria-label={`Quantity of ${product.name}`}
                            className="w-12 text-center text-sm font-bold text-slate-900 border-x border-slate-300 py-1 focus:outline-2 focus:outline-cyan-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => setQuantity(product.id, quantity + 1)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-r-lg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600"
                            aria-label={`Increase quantity of ${product.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-slate-900">
                            {peso(product.price * quantity)}
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(product.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                            aria-label={`Remove ${product.name} from cart`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {product.isBulkEligible && quantity < product.minBulkQty && (
                        <p className="mt-2 text-[11px] text-cyan-800 bg-cyan-50 border border-cyan-200 rounded-lg px-2 py-1.5">
                          Order {product.minBulkQty} or more to qualify for bulk pricing — ask our sales
                          desk for a contract rate.
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-slate-200 px-5 py-4 space-y-3 shrink-0 bg-slate-50">
              {shortfall > 0 ? (
                <div className="flex items-start gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                  <Truck className="h-4 w-4 shrink-0 mt-px text-cyan-700" aria-hidden />
                  <span>
                    Add <strong className="text-slate-900">{peso(shortfall)}</strong> more to qualify for
                    free delivery on our own fleet.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                  <Truck className="h-4 w-4 shrink-0 mt-px" aria-hidden />
                  <span>
                    <strong>Free delivery unlocked</strong> on our own fleet within Metro Manila and Rizal.
                  </span>
                </div>
              )}

              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-600">Goods subtotal</span>
                <span className="text-xl font-extrabold text-slate-900">{peso(subtotal)}</span>
              </div>
              <p className="text-[11px] text-slate-500 -mt-1.5">
                VAT and delivery are calculated at checkout, once we know your address.
              </p>

              <Link to="/checkout" onClick={close} className="block">
                <Button size="lg" fullWidth>
                  Checkout securely
                </Button>
              </Link>
              <Link to="/quote" onClick={close} className="block">
                <Button variant="secondary" fullWidth>
                  Request a formal quotation instead
                </Button>
              </Link>
              <p className="text-[11px] text-center text-slate-500">
                Buying for a hotel, resort or clinic? A quotation gives you a VAT-registered document you
                can submit for approval.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
