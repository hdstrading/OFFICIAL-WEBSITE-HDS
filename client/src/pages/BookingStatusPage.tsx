import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CalendarCheck, Clock, MapPin, Wallet } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { formatDate, formatDateTime, peso } from '../lib/format';
import { Seo } from '../lib/seo';
import { SITE } from '../config/site';
import type { Booking } from '../types';
import { Alert, Badge, Button, Section, Spinner } from '../components/ui';

export default function BookingStatusPage() {
  const { reference = '' } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get('new') === '1';
  const justPaid = searchParams.get('paid') === '1';

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payingError, setPayingError] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .booking(reference)
      .then((data) => setBooking(data.booking))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reference]);

  /**
   * A deposit link can expire, so rather than reusing a stale URL we ask the
   * server for a fresh one at the moment the customer wants to pay.
   */
  async function payDeposit() {
    setGeneratingLink(true);
    setPayingError(null);
    try {
      const { paymentUrl } = await api.bookingDepositLink(reference);
      window.location.href = paymentUrl;
    } catch (err) {
      setPayingError(
        err instanceof ApiError
          ? err.message
          : 'We could not start the payment. Please call our hotline.',
      );
      setGeneratingLink(false);
    }
  }

  if (loading) return <Spinner label="Looking up your booking…" />;

  if (error || !booking) {
    return (
      <Section className="py-16">
        <Alert tone="error" title="We could not find that booking">
          {error ?? 'Please check the reference and try again.'}{' '}
          <Link to="/track" className="underline font-semibold">
            Search again
          </Link>
        </Alert>
      </Section>
    );
  }

  const depositPaid = booking.depositStatus === 'paid';
  const cancelled = booking.bookingStatus === 'Cancelled';

  return (
    <>
      <Seo
        title={`Booking ${booking.reference}`}
        description="Your HDS Trading service booking."
        path={`/booking/${booking.reference}`}
        noindex
      />

      <Section className="py-10 max-w-3xl">
        {isNew && (
          <div className="mb-6">
            <Alert tone="success" title="Your slot is reserved">
              We have emailed the details to <strong>{booking.email}</strong>. Our scheduling desk will
              call you to confirm site access.
            </Alert>
          </div>
        )}
        {justPaid && (
          <div className="mb-6">
            <Alert tone="success" title="Down payment received">
              Thank you — your slot is now locked in. See you on {formatDate(booking.preferredDate)}.
            </Alert>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">
                Booking reference
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900 font-mono">
                {booking.reference}
              </p>
              <p className="mt-1.5 text-sm text-slate-500">
                Booked {formatDateTime(booking.createdAt)}
              </p>
            </div>
            <Badge tone={cancelled ? 'red' : booking.bookingStatus === 'Completed' ? 'emerald' : 'cyan'}>
              {booking.bookingStatus}
            </Badge>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <CalendarCheck className="h-3.5 w-3.5" aria-hidden />
                Date
              </p>
              <p className="mt-1.5 text-lg font-extrabold text-slate-900">
                {formatDate(booking.preferredDate)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Time window
              </p>
              <p className="mt-1.5 text-lg font-extrabold text-slate-900">
                {booking.preferredTimeSlot}
              </p>
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Service</dt>
              <dd className="font-semibold text-slate-900 text-right">{booking.serviceName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Site</dt>
              <dd className="font-semibold text-slate-900 text-right">{booking.institutionName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Contact</dt>
              <dd className="font-semibold text-slate-900 text-right">
                {booking.clientName} · {booking.phone}
              </dd>
            </div>
            {booking.areaSize && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Area</dt>
                <dd className="font-semibold text-slate-900 text-right">{booking.areaSize}</dd>
              </div>
            )}
            {booking.notes && (
              <div className="pt-2.5 border-t border-slate-100">
                <dt className="text-slate-500 mb-1">Your notes</dt>
                <dd className="text-slate-700 leading-relaxed">{booking.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Down payment */}
        {!cancelled && booking.depositAmount > 0 && (
          <div
            className={`mt-6 rounded-2xl border p-6 ${
              depositPaid ? 'border-emerald-200 bg-emerald-50' : 'border-cyan-200 bg-cyan-50'
            }`}
          >
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Wallet className="h-4.5 w-4.5 text-cyan-700" aria-hidden />
              Down payment
            </h2>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Estimated cost</dt>
                <dd className="font-semibold text-slate-900">{peso(booking.estimatedPrice)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Down payment</dt>
                <dd className="font-extrabold text-slate-900">{peso(booking.depositAmount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Balance after the visit</dt>
                <dd className="font-semibold text-slate-900">{peso(booking.balanceDue)}</dd>
              </div>
            </dl>

            {depositPaid ? (
              <p className="mt-4 text-sm font-bold text-emerald-800">
                Paid{booking.depositPaidAt ? ` on ${formatDateTime(booking.depositPaidAt)}` : ''}. Your
                slot is confirmed.
              </p>
            ) : (
              <>
                <p className="mt-4 text-sm text-slate-700 leading-relaxed">
                  Pay the down payment to lock in your slot. Until then we hold it provisionally — if
                  another client pays for the same window first, we will call you to reschedule.
                </p>
                {payingError && (
                  <div className="mt-3">
                    <Alert tone="error">{payingError}</Alert>
                  </div>
                )}
                <Button size="lg" fullWidth className="mt-4" onClick={payDeposit} loading={generatingLink}>
                  Pay {peso(booking.depositAmount)} now
                </Button>
                <p className="mt-2 text-[11px] text-center text-slate-500">
                  Card, GCash, Maya or online bank transfer. Or call {SITE.hotlines[0].numbers[0]} to
                  arrange a deposit over the counter.
                </p>
              </>
            )}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-700" aria-hidden />
            What happens next
          </h2>
          <ol className="mt-3 space-y-2.5 text-sm text-slate-600 list-decimal list-inside leading-relaxed">
            <li>Our scheduling desk calls you to confirm site access, parking and occupancy.</li>
            <li>Settle the down payment to hold the slot.</li>
            <li>Our crew arrives within your booked window with all equipment and chemicals.</li>
            <li>We issue a service report and invoice for the balance on completion.</li>
          </ol>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/services">
            <Button variant="secondary">Browse other services</Button>
          </Link>
          <Link to="/contact">
            <Button variant="ghost">Need to reschedule?</Button>
          </Link>
        </div>
      </Section>
    </>
  );
}
