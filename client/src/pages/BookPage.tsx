import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck, Clock, Info, Wallet } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { formatDate, peso } from '../lib/format';
import { Seo, breadcrumbSchema } from '../lib/seo';
import type { AvailabilityResponse } from '../types';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import {
  Alert,
  Button,
  PageHeader,
  Section,
  SelectField,
  Spinner,
  TextAreaField,
  TextField,
} from '../components/ui';

/** First day of the month a date falls in, as YYYY-MM-01. */
const monthOf = (date: string) => `${date.slice(0, 7)}-01`;

/** Last day of the month, so we fetch exactly the window the calendar shows. */
const endOfMonth = (month: string) => {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0));
  return last.toISOString().slice(0, 10);
};

export default function BookPage() {
  const navigate = useNavigate();
  const { services, loading: catalogLoading } = useCatalog();
  const [searchParams] = useSearchParams();

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [month, setMonth] = useState<string>(() => monthOf(new Date().toISOString().slice(0, 10)));
  const [loadingDays, setLoadingDays] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState(searchParams.get('service') ?? '');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [clientName, setClientName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [areaSize, setAreaSize] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /** Reload the month currently in view. Also used to refresh after a clash. */
  const loadAvailability = useCallback(
    async (targetMonth: string) => {
      setLoadingDays(true);
      setLoadError(null);
      try {
        const data = await api.availability(targetMonth, endOfMonth(targetMonth));
        setAvailability(data);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : 'We could not load the calendar. Please try again.',
        );
      } finally {
        setLoadingDays(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadAvailability(month);
  }, [month, loadAvailability]);

  // Preselect the service from ?service=, once the catalog has arrived.
  useEffect(() => {
    const requested = searchParams.get('service');
    if (requested && services.some((s) => s.id === requested)) setServiceId(requested);
  }, [searchParams, services]);

  const selectedService = services.find((s) => s.id === serviceId);
  const selectedDay = availability?.days.find((d) => d.date === selectedDate);

  const deposit = useMemo(() => {
    if (!selectedService) return null;
    // Mirrors the server's BOOKING_DEPOSIT_PERCENT so the customer sees the
    // figure before committing; the server recomputes it authoritatively.
    const percent = 30;
    const amount = Math.round(((selectedService.basePrice * percent) / 100) * 100) / 100;
    return { percent, amount, balance: selectedService.basePrice - amount };
  }, [selectedService]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!serviceId) {
      setFieldErrors({ serviceId: 'Please choose a service.' });
      return;
    }
    if (!selectedDate || !selectedSlot) {
      setError('Please pick a date and a time slot from the calendar above.');
      return;
    }

    setSubmitting(true);
    try {
      const { booking } = await api.createBooking({
        clientName,
        institutionName,
        email,
        phone,
        serviceId,
        preferredDate: selectedDate,
        preferredTimeSlot: selectedSlot,
        notes: notes || undefined,
        areaSize: areaSize || undefined,
      });
      navigate(`/booking/${booking.reference}?new=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
        // 409 means someone took the slot while this form was open — refresh
        // the calendar so the customer sees the real state, not a stale one.
        if (err.status === 409) {
          setSelectedSlot(null);
          void loadAvailability(month);
        }
      } else {
        setError('Something went wrong. Please try again or call our hotline.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Seo
        title="Book a cleaning or pool service visit"
        description="See which dates and time slots are still open for our cleaning and pool maintenance crews, then reserve your slot online. Secure it with a down payment by card, GCash or Maya."
        path="/book"
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Book a visit', path: '/book' },
        ])}
      />

      <PageHeader
        eyebrow="Booking"
        title="Check available dates & book a visit"
        description="Green dates still have crews free. Pick a date, choose a time window, and we will confirm by phone. Your slot is held once the down payment clears."
      />

      <Section className="py-10">
        <form onSubmit={handleSubmit} noValidate className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          {/* Left: pick what and when */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-700 text-white text-xs font-extrabold">
                  1
                </span>
                Choose a service
              </h2>
              <div className="mt-4">
                {catalogLoading ? (
                  <p className="text-sm text-slate-500">Loading services…</p>
                ) : (
                  <SelectField
                    label="Service"
                    name="serviceId"
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    error={fieldErrors.serviceId}
                    required
                  >
                    <option value="">Select a service…</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} — from {peso(service.basePrice)} / {service.unit}
                      </option>
                    ))}
                  </SelectField>
                )}
              </div>

              {selectedService && (
                <p className="mt-3 text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
                  {selectedService.description}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-4">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-700 text-white text-xs font-extrabold">
                  2
                </span>
                Pick a date
              </h2>

              {loadError ? (
                <Alert tone="error" title="We could not load the calendar">
                  {loadError}{' '}
                  <button
                    type="button"
                    onClick={() => void loadAvailability(month)}
                    className="underline font-semibold"
                  >
                    Try again
                  </button>
                </Alert>
              ) : loadingDays && !availability ? (
                <Spinner label="Checking which dates are open…" />
              ) : availability ? (
                <>
                  <AvailabilityCalendar
                    days={availability.days}
                    month={month}
                    onMonthChange={(next) => {
                      setMonth(next);
                      setSelectedDate(null);
                      setSelectedSlot(null);
                    }}
                    selectedDate={selectedDate}
                    onSelectDate={(date) => {
                      setSelectedDate(date);
                      setSelectedSlot(null);
                    }}
                    earliestDate={availability.earliestDate}
                    latestDate={availability.latestDate}
                  />
                  {loadingDays && (
                    <p className="mt-2 text-xs text-slate-500" role="status">
                      Refreshing availability…
                    </p>
                  )}
                </>
              ) : null}

              {/* Time slots for the chosen day */}
              {selectedDay && (
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-cyan-700" aria-hidden />
                    Time slots on {formatDate(selectedDate!)}
                  </h3>
                  <div
                    role="radiogroup"
                    aria-label="Preferred time slot"
                    className="mt-3 grid gap-2 sm:grid-cols-2"
                  >
                    {selectedDay.slots.map((slot) => {
                      const isSelected = selectedSlot === slot.slot;
                      return (
                        <button
                          key={slot.slot}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          disabled={!slot.available}
                          onClick={() => setSelectedSlot(slot.slot)}
                          className={`rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                            isSelected
                              ? 'border-cyan-700 bg-cyan-50 ring-2 ring-cyan-700/20'
                              : slot.available
                                ? 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/40'
                                : 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                          }`}
                        >
                          <span className="block text-sm font-bold text-slate-900">{slot.slot}</span>
                          <span
                            className={`block text-[11px] mt-0.5 font-semibold ${
                              slot.available ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {slot.available
                              ? `${slot.capacity - slot.booked} of ${slot.capacity} crews free`
                              : 'Fully booked'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.preferredTimeSlot && (
                    <p role="alert" className="mt-2 text-xs text-red-700 font-semibold">
                      {fieldErrors.preferredTimeSlot}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: who and where */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2 mb-4">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-700 text-white text-xs font-extrabold">
                  3
                </span>
                Your details
              </h2>

              <div className="space-y-4">
                <TextField
                  label="Your name"
                  name="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  error={fieldErrors.clientName}
                  required
                  autoComplete="name"
                />
                <TextField
                  label="Company, hotel or property"
                  name="institutionName"
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  error={fieldErrors.institutionName}
                  required
                  autoComplete="organization"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Email address"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    error={fieldErrors.email}
                    required
                    autoComplete="email"
                    hint="Your confirmation goes here."
                  />
                  <TextField
                    label="Contact number"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    error={fieldErrors.phone}
                    required
                    autoComplete="tel"
                    placeholder="0917 123 4567"
                  />
                </div>
                <TextField
                  label="Approximate area"
                  name="areaSize"
                  value={areaSize}
                  onChange={(e) => setAreaSize(e.target.value)}
                  error={fieldErrors.areaSize}
                  placeholder="e.g. 400 sqm lobby, or 25m lagoon pool"
                  hint="Optional, but it helps us send the right size crew."
                />
                <TextAreaField
                  label="Anything we should know"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  error={fieldErrors.notes}
                  rows={3}
                  placeholder="Access restrictions, parking, guest occupancy, preferred entrance…"
                />
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-base font-extrabold text-slate-900">Your booking</h2>

              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Service</dt>
                  <dd className="font-semibold text-slate-900 text-right">
                    {selectedService?.name ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Date</dt>
                  <dd className="font-semibold text-slate-900 text-right">
                    {selectedDate ? formatDate(selectedDate) : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Time</dt>
                  <dd className="font-semibold text-slate-900 text-right">{selectedSlot ?? '—'}</dd>
                </div>
                {selectedService && (
                  <div className="flex justify-between gap-4 pt-2.5 border-t border-slate-200">
                    <dt className="text-slate-500">Estimated cost</dt>
                    <dd className="font-semibold text-slate-900">
                      from {peso(selectedService.basePrice)}
                    </dd>
                  </div>
                )}
              </dl>

              {deposit && (
                <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-3.5">
                  <p className="text-sm font-bold text-cyan-900 flex items-center gap-1.5">
                    <Wallet className="h-4 w-4" aria-hidden />
                    Down payment to hold your slot
                  </p>
                  <p className="mt-1.5 text-2xl font-extrabold text-cyan-900">
                    {peso(deposit.amount)}
                  </p>
                  <p className="mt-1 text-xs text-cyan-800 leading-relaxed">
                    {deposit.percent}% of the estimate. The balance of {peso(deposit.balance)} is
                    settled after the visit, once the final scope is confirmed on site. You can pay by
                    card, GCash, Maya or bank transfer on the next screen.
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-4">
                  <Alert tone="error">{error}</Alert>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                className="mt-4"
                disabled={!serviceId || !selectedDate || !selectedSlot}
              >
                <CalendarCheck className="h-4 w-4" aria-hidden />
                Reserve this slot
              </Button>

              <p className="mt-3 text-[11px] text-slate-500 leading-relaxed flex gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
                Reserving does not charge you anything yet. We confirm by phone first, and the down
                payment link is sent with your confirmation email.
              </p>
            </div>
          </div>
        </form>
      </Section>
    </>
  );
}
