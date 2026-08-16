import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Building2, Check, CreditCard, ExternalLink, Package, Truck } from 'lucide-react';
import { api } from '../lib/api';
import {
  formatDateTime,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  peso,
} from '../lib/format';
import { Seo } from '../lib/seo';
import { usePrimaryHotline } from '../lib/company';
import type { Order } from '../types';
import { Alert, Badge, Button, Section, Spinner } from '../components/ui';

/** The journey an order takes, so the customer can see where theirs is. */
const TIMELINE: { key: Order['orderStatus']; label: string }[] = [
  { key: 'pending_payment', label: 'Order placed' },
  { key: 'processing', label: 'Preparing your order' },
  { key: 'ready_for_dispatch', label: 'Ready for dispatch' },
  { key: 'in_transit', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];

export default function OrderStatusPage() {
  const primaryHotline = usePrimaryHotline();
  const { reference = '' } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get('new') === '1';
  const justPaid = searchParams.get('paid') === '1';

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .order(reference)
      .then((data) => setOrder(data.order))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reference]);

  if (loading) return <Spinner label="Looking up your order…" />;

  if (error || !order) {
    return (
      <Section className="py-16">
        <Alert tone="error" title="We could not find that order">
          {error ?? 'Please check the reference and try again.'}{' '}
          <Link to="/track" className="underline font-semibold">
            Search again
          </Link>
        </Alert>
      </Section>
    );
  }

  const paid = order.paymentStatus === 'paid';
  const currentStep = TIMELINE.findIndex((step) => step.key === order.orderStatus);
  const cancelled = order.orderStatus === 'cancelled';

  return (
    <>
      <Seo
        title={`Order ${order.reference}`}
        description="Track your HDS Trading order."
        path={`/order/${order.reference}`}
        noindex
      />

      <Section className="py-10 max-w-4xl">
        {isNew && (
          <div className="mb-6">
            <Alert tone="success" title="Thank you — your order is in">
              We have emailed your confirmation to <strong>{order.email}</strong>. Keep the reference
              below handy.
            </Alert>
          </div>
        )}
        {justPaid && (
          <div className="mb-6">
            <Alert tone="success" title="Payment received">
              Thank you. We are preparing your order now — you will get a dispatch notice shortly.
            </Alert>
          </div>
        )}

        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">
                Order reference
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900 font-mono">
                {order.reference}
              </p>
              <p className="mt-1.5 text-sm text-slate-500">
                Placed {formatDateTime(order.createdAt)}
              </p>
            </div>
            <div className="text-right">
              <Badge tone={paid ? 'emerald' : 'amber'}>
                {PAYMENT_STATUS_LABELS[order.paymentStatus]}
              </Badge>
              <p className="mt-2 text-2xl font-extrabold text-slate-900">{peso(order.total)}</p>
            </div>
          </div>

          {/* Unpaid online orders keep a live payment link. */}
          {!paid && order.paymentUrl && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <a href={order.paymentUrl}>
                <Button size="lg" fullWidth>
                  <CreditCard className="h-4 w-4" aria-hidden />
                  Pay {peso(order.total)} now
                </Button>
              </a>
            </div>
          )}

          {!paid && order.paymentMethod === 'bank_transfer' && (
            <div className="mt-5">
              <Alert tone="info" title="How to pay by bank transfer">
                Our sales desk will email you our bank and e-wallet details within the hour. Send your
                proof of payment quoting <strong>{order.reference}</strong>, and we release your order
                straight away. Any questions — {primaryHotline}.
              </Alert>
            </div>
          )}

          {order.paymentMethod === 'cod' && !paid && (
            <div className="mt-5">
              <Alert tone="info" title="Cash on delivery">
                Please prepare <strong>{peso(order.total)}</strong> for our rider. We will call before
                we set out.
              </Alert>
            </div>
          )}
        </div>

        {/* Progress */}
        {!cancelled ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-extrabold text-slate-900">Progress</h2>
            <ol className="mt-5 space-y-4">
              {TIMELINE.map((step, index) => {
                const done = index <= currentStep;
                const active = index === currentStep;
                return (
                  <li key={step.key} className="flex gap-3.5">
                    <span
                      aria-hidden
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                        done ? 'bg-cyan-700 text-white' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" /> : index + 1}
                    </span>
                    <div className="pt-0.5">
                      <p className={`text-sm font-bold ${done ? 'text-slate-900' : 'text-slate-400'}`}>
                        {step.label}
                      </p>
                      {active && (
                        <p className="text-xs text-cyan-700 font-semibold mt-0.5">
                          {ORDER_STATUS_LABELS[order.orderStatus]} — current stage
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {order.courierTrackingUrl && (
              <a
                href={order.courierTrackingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-cyan-700 hover:underline"
              >
                Track with the courier
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>
        ) : (
          <div className="mt-6">
            <Alert tone="error" title="This order was cancelled">
              If this was not expected, please call {primaryHotline} and quote{' '}
              {order.reference}.
            </Alert>
          </div>
        )}

        {/* Items */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <h2 className="text-base font-extrabold text-slate-900 px-6 pt-6 flex items-center gap-2">
            <Package className="h-4.5 w-4.5 text-cyan-700" aria-hidden />
            What you ordered
          </h2>

          <ul className="mt-4 divide-y divide-slate-100">
            {order.items.map((item) => (
              <li key={item.productId} className="px-6 py-3.5 flex justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {item.quantity} × {peso(item.unitPrice)} per {item.unit}
                  </p>
                </div>
                <span className="font-bold text-slate-900 shrink-0">{peso(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="font-semibold text-slate-900">{peso(order.subtotal)}</dd>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Discount {order.discountCode && `(${order.discountCode})`}</dt>
                <dd className="font-semibold">− {peso(order.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-600">VAT (12%)</dt>
              <dd className="font-semibold text-slate-900">{peso(order.vat)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Delivery — {order.delivery.label}</dt>
              <dd className="font-semibold text-slate-900">
                {order.deliveryFee === 0 ? 'Free' : peso(order.deliveryFee)}
              </dd>
            </div>
            {order.processingFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-600">Payment processing fee</dt>
                <dd className="font-semibold text-slate-900">{peso(order.processingFee)}</dd>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-200">
              <dt className="font-extrabold text-slate-900">Total</dt>
              <dd className="font-extrabold text-slate-900 text-lg">{peso(order.total)}</dd>
            </div>
          </dl>
        </div>

        {/* Delivery details */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Truck className="h-4 w-4 text-cyan-700" aria-hidden />
              Delivering to
            </h2>
            <address className="mt-3 text-sm text-slate-600 not-italic leading-relaxed">
              <strong className="block text-slate-900">{order.address.contactName}</strong>
              {order.address.phone}
              <br />
              {[order.address.line1, order.address.barangay, order.address.city, order.address.province, order.address.postalCode]
                .filter(Boolean)
                .join(', ')}
              {order.address.landmark && (
                <span className="block mt-1 text-xs text-slate-500">
                  Landmark: {order.address.landmark}
                </span>
              )}
            </address>
            <p className="mt-3 text-xs text-slate-500">{order.delivery.etaLabel}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-cyan-700" aria-hidden />
              Billing &amp; payment
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Ordered by</dt>
                <dd className="font-semibold text-slate-900 text-right">{order.customerName}</dd>
              </div>
              {order.institutionName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Company</dt>
                  <dd className="font-semibold text-slate-900 text-right">{order.institutionName}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Method</dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/products">
            <Button variant="secondary">Continue shopping</Button>
          </Link>
          <Link to="/contact">
            <Button variant="ghost">Need help with this order?</Button>
          </Link>
        </div>
      </Section>
    </>
  );
}
