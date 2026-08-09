import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Minus, Package, Plus, ShieldCheck, Truck } from 'lucide-react';
import { api } from '../lib/api';
import { useCart } from '../lib/cart';
import { peso } from '../lib/format';
import { Seo, breadcrumbSchema, productSchema } from '../lib/seo';
import { PRODUCT_CATEGORY_LABELS, type Product, type Review } from '../types';
import { Alert, Badge, Button, Section, Spinner, StarRating } from '../components/ui';
import ReviewList from '../components/ReviewList';
import ReviewForm from '../components/ReviewForm';

export default function ProductDetailPage() {
  const { id = '' } = useParams();
  const { add } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .product(id)
      .then((data) => {
        setProduct({ ...data.product, rating: data.rating });
        setReviews(data.reviews);
        setQuantity(1);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) return <Spinner label="Loading product…" />;

  if (error || !product) {
    return (
      <Section className="py-16">
        <Alert tone="error" title="We could not find that product">
          {error ?? 'It may have been delisted.'}{' '}
          <Link to="/products" className="underline font-semibold">
            Browse all supplies
          </Link>
        </Alert>
      </Section>
    );
  }

  const specs = Object.entries(product.specs);

  return (
    <>
      <Seo
        title={product.name}
        description={product.description.slice(0, 300)}
        path={`/products/${product.id}`}
        image={product.image}
        structuredData={[
          productSchema(product),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Supplies', path: '/products' },
            { name: product.name, path: `/products/${product.id}` },
          ]),
        ]}
      />

      <Section className="py-6">
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-cyan-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to all supplies
        </Link>
      </Section>

      <Section className="pb-14">
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Image */}
          <div className="relative aspect-4/3 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
            <div className="absolute inset-0 grid place-items-center text-slate-300">
              <Package className="h-14 w-14" aria-hidden />
            </div>
            <img
              src={product.image}
              alt={product.name}
              className="relative h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden';
              }}
            />
          </div>

          {/* Buy box */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-700">
              {PRODUCT_CATEGORY_LABELS[product.category]}
              {product.subcategory && ` · ${product.subcategory}`}
            </p>

            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
              {product.name}
            </h1>

            <div className="mt-3">
              <StarRating
                value={product.rating?.average ?? 0}
                count={product.rating?.count ?? 0}
                size="md"
              />
            </div>

            <p className="mt-5 text-slate-600 leading-relaxed">{product.description}</p>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-900">{peso(product.price)}</span>
                <span className="text-sm font-semibold text-slate-500">per {product.unit}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Price excludes 12% VAT, which is added at checkout.
              </p>

              {product.isBulkEligible && (
                <p className="mt-3">
                  <Badge tone="cyan">
                    Bulk pricing from {product.minBulkQty} {product.unit}
                    {product.minBulkQty > 1 ? 's' : ''}
                  </Badge>
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-end gap-3">
                <div>
                  <label
                    htmlFor="quantity"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Quantity
                  </label>
                  <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-l-xl"
                      aria-label="Reduce quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      id="quantity"
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                      className="w-16 text-center font-bold text-slate-900 border-x border-slate-300 py-2.5 focus:outline-2 focus:outline-cyan-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-r-xl"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-w-45">
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">
                    Subtotal: <strong className="text-slate-900">{peso(product.price * quantity)}</strong>
                  </p>
                  <Button size="lg" fullWidth onClick={() => add(product, quantity)}>
                    Add to cart
                  </Button>
                </div>
              </div>

              <ul className="mt-5 space-y-2 text-xs text-slate-600">
                <li className="flex gap-2">
                  <Truck className="h-4 w-4 shrink-0 text-cyan-700" aria-hidden />
                  Free delivery on our own fleet for orders over ₱5,000, or same-day via Lalamove and
                  Transportify.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-700" aria-hidden />
                  VAT-registered invoice issued with every order.
                </li>
              </ul>
            </div>

            <p className="mt-4 text-sm text-slate-600">
              Buying in volume?{' '}
              <Link to="/quote" className="font-semibold text-cyan-700 hover:underline">
                Request a formal quotation
              </Link>{' '}
              and we will apply contract pricing.
            </p>
          </div>
        </div>

        {/* Features and specs */}
        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {product.features.length > 0 && (
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">What you get</h2>
              <ul className="mt-4 space-y-3">
                {product.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed">
                    <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {specs.length > 0 && (
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Specifications</h2>
              <dl className="mt-4 rounded-2xl border border-slate-200 overflow-hidden">
                {specs.map(([key, value], index) => (
                  <div
                    key={key}
                    className={`grid grid-cols-2 gap-4 px-4 py-3 text-sm ${
                      index % 2 ? 'bg-white' : 'bg-slate-50'
                    }`}
                  >
                    <dt className="text-slate-500">{key}</dt>
                    <dd className="font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        {/* Reviews */}
        <div className="mt-16 pt-12 border-t border-slate-200 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Customer reviews</h2>
            <div className="mt-5">
              <ReviewList reviews={reviews} />
            </div>
          </div>
          <div>
            <ReviewForm
              subjectType="product"
              subjectId={product.id}
              subjectName={product.name}
              onSubmitted={load}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
