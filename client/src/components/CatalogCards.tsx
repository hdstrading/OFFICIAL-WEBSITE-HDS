import { Link } from 'react-router-dom';
import { CalendarCheck, Package, Plus } from 'lucide-react';
import type { Product, Service } from '../types';
import { PRODUCT_CATEGORY_LABELS, SERVICE_CATEGORY_LABELS, stockLevel } from '../types';
import { peso, pesoShort } from '../lib/format';
import { useCart } from '../lib/cart';
import { Badge, Button, StarRating } from './ui';

/**
 * A placeholder that keeps the card's layout intact when a product photo is
 * missing or fails to load, instead of showing a broken-image icon.
 */
function ImageFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-100 text-slate-300">
      <Package className="h-10 w-10" aria-hidden />
    </div>
  );
}

/** Availability as a level, with wording a buyer can act on. */
export function StockBadge({ product }: { product: Product }) {
  const level = stockLevel(product);
  if (level === 'untracked') return null;
  if (level === 'out_of_stock') return <Badge tone="red">Out of stock</Badge>;
  if (level === 'low_stock') {
    return <Badge tone="amber">Only {product.stockAvailable} left</Badge>;
  }
  return <Badge tone="emerald">In stock</Badge>;
}

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const soldOut = stockLevel(product) === 'out_of_stock';

  return (
    <article className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-cyan-300 hover:shadow-lg transition-all">
      <Link
        to={`/products/${product.id}`}
        className="relative block aspect-4/3 overflow-hidden bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600"
      >
        <ImageFallback />
        <img
          src={product.image}
          alt={product.name}
          loading="lazy"
          className="relative h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
        <span className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5">
          <StockBadge product={product} />
          {product.isBulkEligible && <Badge tone="cyan">Bulk pricing available</Badge>}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700">
          {PRODUCT_CATEGORY_LABELS[product.category]}
        </p>

        <h3 className="mt-1.5 text-sm font-bold text-slate-900 leading-snug line-clamp-2">
          <Link
            to={`/products/${product.id}`}
            className="hover:text-cyan-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 rounded"
          >
            {product.name}
          </Link>
        </h3>

        <p className="mt-1.5 text-xs text-slate-500 leading-relaxed line-clamp-2">
          {product.description}
        </p>

        <div className="mt-2.5">
          <StarRating value={product.rating?.average ?? 0} count={product.rating?.count ?? 0} />
        </div>

        <div className="mt-auto pt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-slate-900 leading-none">{peso(product.price)}</p>
            <p className="mt-1 text-[11px] text-slate-500">per {product.unit}</p>
          </div>
          <Button
            size="sm"
            disabled={soldOut}
            onClick={() => add(product, 1)}
            aria-label={
              soldOut ? `${product.name} is out of stock` : `Add ${product.name} to cart`
            }
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {soldOut ? 'Sold out' : 'Add'}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="group flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-emerald-300 hover:shadow-lg transition-all">
      <Link
        to={`/services/${service.id}`}
        className="relative block aspect-16/9 overflow-hidden bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600"
      >
        <ImageFallback />
        <img
          src={service.image}
          alt={service.name}
          loading="lazy"
          className="relative h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
        />
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
          {SERVICE_CATEGORY_LABELS[service.category]}
        </p>

        <h3 className="mt-1.5 text-base font-bold text-slate-900 leading-snug">
          <Link
            to={`/services/${service.id}`}
            className="hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 rounded"
          >
            {service.name}
          </Link>
        </h3>

        <p className="mt-1 text-xs font-semibold text-slate-500">{service.tagline}</p>
        <p className="mt-2.5 text-sm text-slate-600 leading-relaxed line-clamp-3">
          {service.description}
        </p>

        {service.idealFor.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {service.idealFor.slice(0, 3).map((item) => (
              <li key={item}>
                <Badge tone="emerald">{item}</Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3">
          <StarRating value={service.rating?.average ?? 0} count={service.rating?.count ?? 0} />
        </div>

        <div className="mt-auto pt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500">Starts at</p>
            <p className="text-lg font-extrabold text-slate-900 leading-tight">
              {pesoShort(service.basePrice)}
              <span className="text-xs font-semibold text-slate-500"> / {service.unit}</span>
            </p>
          </div>
          <Link to={`/book?service=${encodeURIComponent(service.id)}`}>
            <Button size="sm">
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
              Check dates
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}
