import { useCallback, useEffect, useState } from 'react';
import {
  CalendarX2,
  Download,
  MessageSquare,
  Package,
  ShoppingCart,
  Sparkles,
  Tag,
  Warehouse,
  Wrench,
} from 'lucide-react';
import { adminApi, ApiError } from '../../lib/api';
import { formatDate, formatDateTime, peso, PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS } from '../../lib/format';
import type { Booking, DiscountCode, Order, QuoteRequest, Review } from '../../types';
import { Alert, Badge, Button, Section, SelectField, Spinner, StarRating, TextField } from '../../components/ui';
import CatalogEditor from './CatalogEditor';
import InventoryLink from './InventoryLink';

type Tab =
  | 'overview'
  | 'orders'
  | 'inventory'
  | 'bookings'
  | 'quotes'
  | 'catalog'
  | 'reviews'
  | 'calendar'
  | 'promos';

const TABS: { key: Tab; label: string; icon: typeof Package }[] = [
  { key: 'overview', label: 'Overview', icon: Sparkles },
  { key: 'orders', label: 'Orders', icon: ShoppingCart },
  { key: 'inventory', label: 'Warehouse', icon: Warehouse },
  { key: 'bookings', label: 'Bookings', icon: CalendarX2 },
  { key: 'quotes', label: 'Quotations', icon: Package },
  { key: 'catalog', label: 'Catalog', icon: Wrench },
  { key: 'reviews', label: 'Reviews', icon: MessageSquare },
  { key: 'calendar', label: 'Block dates', icon: CalendarX2 },
  { key: 'promos', label: 'Discounts', icon: Tag },
];

export default function AdminDashboard({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);

  /**
   * Any 401 from a data call means the session lapsed while the tab was open —
   * bounce back to the sign-in screen rather than showing empty tables.
   */
  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    },
    [onSessionExpired],
  );

  return (
    <Section className="py-8">
      <nav className="flex flex-wrap gap-1.5 mb-6" aria-label="Admin sections">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setError(null);
            }}
            aria-current={tab === key ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
              tab === key ? 'bg-cyan-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="mb-5">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {tab === 'overview' && <OverviewTab onError={handleError} />}
      {tab === 'orders' && <OrdersTab onError={handleError} />}
      {tab === 'inventory' && <InventoryLink onError={handleError} />}
      {tab === 'bookings' && <BookingsTab onError={handleError} />}
      {tab === 'quotes' && <QuotesTab onError={handleError} />}
      {tab === 'catalog' && <CatalogEditor onError={handleError} />}
      {tab === 'reviews' && <ReviewsTab onError={handleError} />}
      {tab === 'calendar' && <BlockedDatesTab onError={handleError} />}
      {tab === 'promos' && <DiscountsTab onError={handleError} />}
    </Section>
  );
}

type ErrorHandler = { onError: (err: unknown) => void };

/* ------------------------------------------------------------------ overview */

function OverviewTab({ onError }: ErrorHandler) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof adminApi.stats>> | null>(null);
  const [integrations, setIntegrations] = useState<Awaited<ReturnType<typeof adminApi.integrations>> | null>(null);

  useEffect(() => {
    adminApi.stats().then(setStats).catch(onError);
    adminApi.integrations().then(setIntegrations).catch(onError);
  }, [onError]);

  if (!stats) return <Spinner label="Loading dashboard…" />;

  const cards: [string, string, string?][] = [
    ['Revenue collected', peso(stats.revenue), `${stats.paidOrders} paid orders`],
    ['Orders', String(stats.orders), `${stats.pendingOrders} awaiting payment`],
    ['Bookings', String(stats.bookings), `${stats.upcomingBookings} upcoming`],
    ['Deposits outstanding', peso(stats.depositsOutstanding), 'On confirmed bookings'],
    ['Quotation requests', String(stats.quotes)],
    ['Reviews', String(stats.reviews), `${stats.pendingReviews} awaiting moderation`],
    ['Products listed', String(stats.products)],
    ['Services listed', String(stats.services)],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1.5 text-2xl font-extrabold text-slate-900">{value}</p>
            {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-900">Export your data</h2>
        <p className="mt-1 text-sm text-slate-500">
          Download a spreadsheet you can open in Excel or Google Sheets.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {(['orders', 'bookings', 'quotes'] as const).map((kind) => (
            <a key={kind} href={adminApi.exportUrl(kind)} download>
              <Button variant="secondary" size="sm">
                <Download className="h-4 w-4" aria-hidden />
                {kind.charAt(0).toUpperCase() + kind.slice(1)} CSV
              </Button>
            </a>
          ))}
        </div>
      </div>

      {integrations && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-extrabold text-slate-900">Integrations</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configured on the server. Ask your developer to set the environment variables to turn one on.
          </p>
          <ul className="mt-4 divide-y divide-slate-100">
            {Object.entries(integrations.integrations).map(([key, value]) => (
              <li key={key} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm font-semibold text-slate-800 capitalize">
                  {value.name ?? key}
                  {value.mode && <span className="ml-2 text-xs text-slate-400">({value.mode})</span>}
                </span>
                <Badge tone={value.configured ? 'emerald' : 'slate'}>
                  {value.configured ? 'Active' : 'Not configured'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- orders */

function OrdersTab({ onError }: ErrorHandler) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .orders()
      .then((d) => setOrders(d.orders))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  async function update(id: string, data: { orderStatus?: string; paymentStatus?: string }) {
    setBusy(id);
    try {
      await adminApi.updateOrderStatus(id, data);
      load();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }

  async function dispatchOrder(id: string) {
    setBusy(id);
    try {
      await adminApi.dispatchOrder(id);
      load();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading orders…" />;
  if (orders.length === 0)
    return <p className="text-sm text-slate-500 py-10 text-center">No orders yet.</p>;

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono font-bold text-slate-900">{order.reference}</p>
              <p className="mt-0.5 text-sm text-slate-600">
                {order.customerName}
                {order.institutionName && ` · ${order.institutionName}`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {order.email} · {order.phone} · {formatDateTime(order.createdAt)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xl font-extrabold text-slate-900">{peso(order.total)}</p>
              <div className="mt-1 flex gap-1.5 justify-end">
                <Badge tone={order.paymentStatus === 'paid' ? 'emerald' : 'amber'}>
                  {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                </Badge>
                <Badge tone="slate">{ORDER_STATUS_LABELS[order.orderStatus]}</Badge>
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-600">
            {order.items.map((i) => `${i.name} ×${i.quantity}`).join(' · ')}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            <strong>{order.delivery.label}</strong> to{' '}
            {[order.address.line1, order.address.city, order.address.province].filter(Boolean).join(', ')}
          </p>

          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-end gap-3">
            <div className="w-48">
              <SelectField
                label="Order status"
                value={order.orderStatus}
                onChange={(e) => update(order.id, { orderStatus: e.target.value })}
                disabled={busy === order.id}
              >
                {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </SelectField>
            </div>
            {order.paymentStatus !== 'paid' && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === order.id}
                onClick={() => update(order.id, { paymentStatus: 'paid' })}
              >
                Mark as paid
              </Button>
            )}
            {order.delivery.provider === 'lalamove' && !order.courierBookingRef && (
              <Button size="sm" loading={busy === order.id} onClick={() => dispatchOrder(order.id)}>
                Book Lalamove rider
              </Button>
            )}
            {order.courierTrackingUrl && (
              <a
                href={order.courierTrackingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-cyan-700 hover:underline"
              >
                Courier tracking →
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ bookings */

function BookingsTab({ onError }: ErrorHandler) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .bookings()
      .then((d) => setBookings(d.bookings))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  async function act(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    try {
      await action();
      load();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading bookings…" />;
  if (bookings.length === 0)
    return <p className="text-sm text-slate-500 py-10 text-center">No bookings yet.</p>;

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <div key={booking.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono font-bold text-slate-900">{booking.reference}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{booking.serviceName}</p>
              <p className="text-sm text-slate-600 mt-0.5">
                {formatDate(booking.preferredDate)} · {booking.preferredTimeSlot}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {booking.clientName} · {booking.institutionName} · {booking.phone} · {booking.email}
              </p>
              {booking.areaSize && (
                <p className="text-xs text-slate-500 mt-0.5">Area: {booking.areaSize}</p>
              )}
              {booking.notes && (
                <p className="text-xs text-slate-500 mt-1 italic">“{booking.notes}”</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-extrabold text-slate-900">{peso(booking.estimatedPrice)}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Deposit {peso(booking.depositAmount)} · Balance {peso(booking.balanceDue)}
              </p>
              <div className="mt-1.5 flex gap-1.5 justify-end">
                <Badge tone={booking.depositStatus === 'paid' ? 'emerald' : 'amber'}>
                  Deposit {booking.depositStatus === 'paid' ? 'paid' : 'unpaid'}
                </Badge>
                <Badge tone="slate">{booking.bookingStatus}</Badge>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-end gap-3">
            <div className="w-48">
              <SelectField
                label="Booking status"
                value={booking.bookingStatus}
                onChange={(e) => act(booking.id, () => adminApi.updateBookingStatus(booking.id, e.target.value))}
                disabled={busy === booking.id}
              >
                {['Confirmed', 'Pending Callback', 'Completed', 'Cancelled'].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </SelectField>
            </div>
            {booking.depositStatus !== 'paid' && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === booking.id}
                onClick={() => act(booking.id, () => adminApi.markDepositPaid(booking.id))}
              >
                Record deposit paid
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- quotes */

function QuotesTab({ onError }: ErrorHandler) {
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .quotes()
      .then((d) => setQuotes(d.quotes))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  if (loading) return <Spinner label="Loading quotations…" />;
  if (quotes.length === 0)
    return <p className="text-sm text-slate-500 py-10 text-center">No quotation requests yet.</p>;

  return (
    <div className="space-y-3">
      {quotes.map((quote) => (
        <div key={quote.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono font-bold text-slate-900">{quote.reference}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{quote.institutionName}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {quote.clientName} · {quote.email} · {quote.phone}
              </p>
              <p className="text-xs text-slate-500 mt-1">{quote.address}</p>
              <p className="mt-2 text-xs text-slate-600">
                {quote.items.map((i) => `${i.name} ×${i.quantity}`).join(' · ')}
              </p>
              {quote.instructions && (
                <p className="text-xs text-slate-500 mt-1.5 italic">“{quote.instructions}”</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-extrabold text-slate-900">{peso(quote.total)}</p>
              <div className="mt-1.5 flex gap-1.5 justify-end">
                <Badge tone={quote.urgency === 'immediate' ? 'red' : quote.urgency === 'urgent' ? 'amber' : 'slate'}>
                  {quote.urgency}
                </Badge>
                <Badge tone="cyan">{quote.status}</Badge>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 w-48">
            <SelectField
              label="Status"
              value={quote.status}
              onChange={async (e) => {
                try {
                  await adminApi.updateQuoteStatus(quote.id, e.target.value);
                  load();
                } catch (err) {
                  onError(err);
                }
              }}
            >
              {['Received', 'Reviewing', 'Quoted', 'Won', 'Closed'].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- reviews */

function ReviewsTab({ onError }: ErrorHandler) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .reviews()
      .then((d) => setReviews(d.reviews))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      load();
    } catch (err) {
      onError(err);
    }
  }

  if (loading) return <Spinner label="Loading reviews…" />;
  if (reviews.length === 0)
    return <p className="text-sm text-slate-500 py-10 text-center">No reviews submitted yet.</p>;

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <div
          key={review.id}
          className={`rounded-2xl border p-5 ${
            review.published ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-bold text-slate-900">
                {review.authorName}
                {review.institutionName && (
                  <span className="font-normal text-slate-500"> · {review.institutionName}</span>
                )}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                On {review.subjectName} · {formatDateTime(review.createdAt)}
              </p>
              <div className="mt-2">
                <StarRating value={review.rating} count={1} showCount={false} />
              </div>
              <p className="mt-2.5 text-sm text-slate-700 leading-relaxed">{review.comment}</p>
            </div>
            <div className="flex flex-col gap-1.5 items-end shrink-0">
              {review.verified && <Badge tone="emerald">Verified buyer</Badge>}
              <Badge tone={review.published ? 'cyan' : 'amber'}>
                {review.published ? 'Published' : 'Awaiting moderation'}
              </Badge>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200/70 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={review.published ? 'secondary' : 'primary'}
              onClick={() => act(() => adminApi.setReviewPublished(review.id, !review.published))}
            >
              {review.published ? 'Unpublish' : 'Publish to website'}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (confirm('Delete this review permanently?')) {
                  act(() => adminApi.deleteReview(review.id));
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- blocked dates */

function BlockedDatesTab({ onError }: ErrorHandler) {
  const [dates, setDates] = useState<{ date: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('Fully booked');

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .blockedDates()
      .then((d) => setDates(d.blockedDates))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-900">Close a date for bookings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Blocked dates disappear from the customer-facing calendar immediately. Use this for holidays,
          company events or days when all crews are committed elsewhere.
        </p>

        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newDate) return;
            try {
              await adminApi.blockDate(newDate, reason || 'Fully booked');
              setNewDate('');
              load();
            } catch (err) {
              onError(err);
            }
          }}
        >
          <div className="w-44">
            <TextField
              label="Date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
            />
          </div>
          <div className="flex-1 min-w-52">
            <TextField
              label="Reason shown to customers"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fully booked"
            />
          </div>
          <Button type="submit">Block this date</Button>
        </form>
      </div>

      {loading ? (
        <Spinner label="Loading blocked dates…" />
      ) : dates.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          No dates are blocked. Every working day is open for booking.
        </p>
      ) : (
        <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {dates.map((entry) => (
            <li key={entry.date} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div>
                <p className="font-semibold text-slate-900">{formatDate(entry.date)}</p>
                <p className="text-xs text-slate-500">{entry.reason}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await adminApi.unblockDate(entry.date);
                    load();
                  } catch (err) {
                    onError(err);
                  }
                }}
              >
                Reopen
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- discounts */

function DiscountsTab({ onError }: ErrorHandler) {
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('10');
  const [description, setDescription] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .discounts()
      .then((d) => setDiscounts(d.discounts))
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-extrabold text-slate-900">Create a discount code</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await adminApi.createDiscount({ code, type, value: Number(value), description });
              setCode('');
              setDescription('');
              load();
            } catch (err) {
              onError(err);
            }
          }}
        >
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="WELCOME10"
            required
          />
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as 'percentage' | 'fixed')}>
            <option value="percentage">Percentage off</option>
            <option value="fixed">Fixed peso amount</option>
          </SelectField>
          <TextField
            label={type === 'percentage' ? 'Percent' : 'Amount (₱)'}
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown at checkout"
          />
          <Button type="submit">Create code</Button>
        </form>
      </div>

      {loading ? (
        <Spinner label="Loading discount codes…" />
      ) : discounts.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No discount codes yet.</p>
      ) : (
        <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {discounts.map((discount) => (
            <li key={discount.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div>
                <p className="font-mono font-bold text-slate-900">{discount.code}</p>
                <p className="text-xs text-slate-500">
                  {discount.type === 'percentage' ? `${discount.value}% off` : `${peso(discount.value)} off`}
                  {discount.description && ` · ${discount.description}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (!confirm(`Delete ${discount.code}?`)) return;
                  try {
                    await adminApi.deleteDiscount(discount.id);
                    load();
                  } catch (err) {
                    onError(err);
                  }
                }}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
