import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Banknote,
  CreditCard,
  Lock,
  MapPin,
  ShoppingBag,
  Smartphone,
  Tag,
  Truck,
  Wallet,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useCart } from '../lib/cart';
import { peso } from '../lib/format';
import { Seo } from '../lib/seo';
import { useCompany, usePrimaryHotline } from '../lib/company';
import type { DeliveryAddress, DeliveryOption, PaymentMethod, PaymentMethodOption } from '../types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Section,
  TextAreaField,
  TextField,
} from '../components/ui';
import LocationPicker, { type FoundAddress } from '../components/LocationPicker';

const PAYMENT_ICONS: Record<PaymentMethod, typeof CreditCard> = {
  card: CreditCard,
  gcash: Smartphone,
  maya: Smartphone,
  online_banking: Banknote,
  bank_transfer: Banknote,
  cod: Wallet,
};

const emptyAddress: DeliveryAddress = {
  contactName: '',
  phone: '',
  line1: '',
  barangay: '',
  city: '',
  province: '',
  postalCode: '',
  landmark: '',
};

export default function CheckoutPage() {
  const company = useCompany();
  const primaryHotline = usePrimaryHotline();
  const navigate = useNavigate();
  const { items, subtotal, count, toPayload, clear } = useCart();
  const [searchParams] = useSearchParams();
  const cancelledReference = searchParams.get('cancelled');

  const [customerName, setCustomerName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState<DeliveryAddress>(emptyAddress);

  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOption[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOption | null>(null);
  const [quotingDelivery, setQuotingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  const [mapsKey, setMapsKey] = useState('');
  /** An address the pin resolved to that disagrees with what the customer typed. */
  const [suggested, setSuggested] = useState<FoundAddress | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);

  const [discountInput, setDiscountInput] = useState('');
  const [discount, setDiscount] = useState<{ code: string; amount: number; label: string | null } | null>(
    null,
  );
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [checkingDiscount, setCheckingDiscount] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .paymentMethods()
      .then((data) => {
        setPaymentMethods(data.methods);
        // Default to the first method that is actually usable right now.
        setPaymentMethod(data.methods.find((m) => m.available)?.id ?? null);
      })
      .catch(() => setPaymentMethods([]));

    // The map key is served at runtime rather than baked into the build, so
    // adding or rotating it is an .env edit and a restart, not a rebuild.
    api
      .siteInfo()
      .then((info) => setMapsKey(info.mapsBrowserKey ?? ''))
      .catch(() => setMapsKey(''));
  }, []);

  /** The address fields a pin can fill, and what the customer currently has. */
  const PIN_FILLED_FIELDS = ['line1', 'barangay', 'city', 'province', 'postalCode'] as const;

  /**
   * Takes what the pin resolved to, without overwriting anything typed.
   *
   * Blank fields are filled silently — that is the whole convenience, and there
   * is nothing to lose. A field the customer has already written in is left
   * alone and offered instead, because they are more likely to be right about
   * their own address than Google is: a unit number, a building name, a street
   * Google renders differently. Overwriting that mid-checkout is how a customer
   * ends up receiving somebody else's version of where they live.
   */
  function applyFoundAddress(found: FoundAddress) {
    const filled: Partial<DeliveryAddress> = {};
    let conflicts = false;

    for (const field of PIN_FILLED_FIELDS) {
      const current = (address[field] ?? '').trim();
      const discovered = (found[field] ?? '').trim();
      if (!discovered) continue;
      if (!current) filled[field] = discovered;
      else if (current.toLowerCase() !== discovered.toLowerCase()) conflicts = true;
    }

    if (Object.keys(filled).length > 0) setAddress((prev) => ({ ...prev, ...filled }));
    setSuggested(conflicts ? found : null);
  }

  /** Replaces every field with the pin's version, on the customer's say-so. */
  function acceptSuggestion() {
    if (!suggested) return;
    setAddress((prev) => ({
      ...prev,
      line1: suggested.line1 || prev.line1,
      barangay: suggested.barangay || prev.barangay,
      city: suggested.city || prev.city,
      province: suggested.province || prev.province,
      postalCode: suggested.postalCode || prev.postalCode,
    }));
    setSuggested(null);
    setDeliveryOptions([]);
    setSelectedDelivery(null);
  }

  /** Delivery prices depend on the address, so quote once it is complete enough. */
  async function fetchDeliveryOptions() {
    if (!address.line1 || !address.city || !address.province) {
      setDeliveryError('Enter your street address, city and province to see delivery options.');
      return;
    }
    setQuotingDelivery(true);
    setDeliveryError(null);
    try {
      const data = await api.deliveryQuote(toPayload(), { ...address, contactName: address.contactName || customerName, phone: address.phone || phone });
      setDeliveryOptions(data.options);
      setSelectedDelivery(data.options[0] ?? null);
    } catch (err) {
      setDeliveryError(
        err instanceof ApiError ? err.message : 'We could not fetch delivery rates. Please try again.',
      );
    } finally {
      setQuotingDelivery(false);
    }
  }

  async function applyDiscount() {
    const code = discountInput.trim();
    if (!code) return;
    setCheckingDiscount(true);
    setDiscountError(null);
    try {
      const result = await api.validateDiscount(code, toPayload());
      setDiscount({ code: result.code, amount: result.discountAmount, label: result.label });
    } catch (err) {
      setDiscount(null);
      setDiscountError(err instanceof ApiError ? err.message : 'We could not check that code.');
    } finally {
      setCheckingDiscount(false);
    }
  }

  // Totals shown here mirror the server's calculation; the server recomputes
  // everything from the catalog when the order is placed.
  const discountAmount = discount?.amount ?? 0;
  const net = Math.max(0, subtotal - discountAmount);
  const vat = Math.round(net * 0.12 * 100) / 100;
  const deliveryFee = selectedDelivery?.fee ?? 0;
  const payable = Math.round((net + vat + deliveryFee) * 100) / 100;

  // The gateway's cut depends on how the customer chooses to pay, so it can only
  // be worked out once a method is picked — and it has to be visible the moment
  // it is, rather than appearing for the first time on the payment page.
  const feePercent = paymentMethods.find((m) => m.id === paymentMethod)?.feePercent ?? 0;
  const processingFee = Math.round(payable * (feePercent / 100) * 100) / 100;
  const total = Math.round((payable + processingFee) * 100) / 100;

  const codBlocked = paymentMethod === 'cod' && total > 20_000;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!selectedDelivery) {
      setError('Please choose a delivery option before placing your order.');
      return;
    }
    if (!paymentMethod) {
      setError('Please choose how you would like to pay.');
      return;
    }

    setSubmitting(true);
    try {
      const { order } = await api.placeOrder({
        customerName,
        institutionName: institutionName || undefined,
        email,
        phone,
        items: toPayload(),
        address: {
          ...address,
          contactName: address.contactName || customerName,
          phone: address.phone || phone,
        },
        deliveryProvider: selectedDelivery.provider,
        deliveryServiceCode: selectedDelivery.serviceCode,
        paymentMethod,
        discountCode: discount?.code,
        notes: notes || undefined,
      });

      clear();

      // Online methods hand off to the payment gateway; everything else lands
      // on the order page with instructions.
      if (order.paymentUrl) {
        window.location.href = order.paymentUrl;
        return;
      }
      navigate(`/order/${order.reference}?new=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
      } else {
        setError('Something went wrong. Please try again or call our hotline.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  if (count === 0) {
    return (
      <>
        <Seo title="Checkout" description="Complete your order." path="/checkout" noindex />
        <Section className="py-16">
          <EmptyState
            icon={<ShoppingBag className="h-12 w-12" />}
            title="Your cart is empty"
            description="Add some supplies to your cart and come back here to check out."
            action={
              <Link to="/products">
                <Button size="lg">Browse supplies</Button>
              </Link>
            }
          />
        </Section>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Checkout"
        description="Complete your order securely."
        path="/checkout"
        noindex
      />

      <PageHeader
        eyebrow="Checkout"
        title="Complete your order"
        description="Three steps: where it goes, how it gets there, and how you would like to pay. You do not need an account."
      />

      <Section className="py-10">
        {cancelledReference && (
          <div className="mb-6">
            <Alert tone="warning" title="Payment was cancelled">
              Your order <strong>{cancelledReference}</strong> is saved and unpaid. You can{' '}
              <Link to={`/order/${cancelledReference}`} className="underline font-semibold">
                open it and pay again
              </Link>
              , or place a new order below.
            </Alert>
          </div>
        )}

        {error && (
          <div className="mb-6">
            <Alert tone="error" title="We could not place your order">
              {error}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-6">
            {/* 1. Contact */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-700 text-white text-xs font-extrabold">
                  1
                </span>
                Who is ordering
              </h2>

              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Your name"
                    name="customerName"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    error={fieldErrors.customerName}
                    required
                    autoComplete="name"
                  />
                  <TextField
                    label="Company or property"
                    name="institutionName"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    error={fieldErrors.institutionName}
                    placeholder="Optional"
                    autoComplete="organization"
                  />
                </div>
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
                    hint="Your receipt and tracking details go here."
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
              </div>
            </section>

            {/* 2. Address */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-700 text-white text-xs font-extrabold">
                  2
                </span>
                Where should we deliver?
              </h2>

              <div className="mt-5 space-y-4">
                <TextField
                  label="Street address"
                  name="address.line1"
                  value={address.line1}
                  onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                  error={fieldErrors['address.line1']}
                  required
                  autoComplete="address-line1"
                  placeholder="Building, street, unit number"
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField
                    label="Barangay"
                    name="address.barangay"
                    value={address.barangay}
                    onChange={(e) => setAddress({ ...address, barangay: e.target.value })}
                    error={fieldErrors['address.barangay']}
                    placeholder="Optional"
                  />
                  <TextField
                    label="City / municipality"
                    name="address.city"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    error={fieldErrors['address.city']}
                    required
                    autoComplete="address-level2"
                  />
                  <TextField
                    label="Province"
                    name="address.province"
                    value={address.province}
                    onChange={(e) => setAddress({ ...address, province: e.target.value })}
                    error={fieldErrors['address.province']}
                    required
                    autoComplete="address-level1"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Postal code"
                    name="address.postalCode"
                    value={address.postalCode}
                    onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                    error={fieldErrors['address.postalCode']}
                    placeholder="Optional"
                    autoComplete="postal-code"
                  />
                  <TextField
                    label="Landmark"
                    name="address.landmark"
                    value={address.landmark}
                    onChange={(e) => setAddress({ ...address, landmark: e.target.value })}
                    error={fieldErrors['address.landmark']}
                    placeholder="Optional — helps our driver find you"
                  />
                </div>

                <LocationPicker
                  addressHint={[address.line1, address.barangay, address.city, address.province]
                    .filter(Boolean)
                    .join(', ')}
                  value={
                    address.lat !== undefined && address.lng !== undefined
                      ? { lat: address.lat, lng: address.lng }
                      : null
                  }
                  onChange={(pin) => {
                    setAddress({ ...address, lat: pin?.lat, lng: pin?.lng });
                    // The pin changes the distance, so any prices already on
                    // screen are stale. Clearing them forces a re-quote rather
                    // than letting somebody buy at the old figure.
                    setDeliveryOptions([]);
                    setSelectedDelivery(null);
                  }}
                  onAddressFound={applyFoundAddress}
                  mapsKey={mapsKey}
                />

                {suggested && (
                  <div className="mt-3">
                    <Alert tone="info" title="That pin is at a different address">
                      <p className="leading-relaxed">
                        We read your pin as <strong>{suggested.formatted}</strong>. Your own wording
                        is kept unless you say otherwise — a unit or building name is often more
                        useful to the driver than what a map returns.
                      </p>
                      <p className="mt-2.5 flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={acceptSuggestion}>
                          Use the pin's address
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setSuggested(null)}
                        >
                          Keep what I typed
                        </Button>
                      </p>
                    </Alert>
                  </div>
                )}

                <Button type="button" variant="secondary" onClick={fetchDeliveryOptions} loading={quotingDelivery}>
                  <Truck className="h-4 w-4" aria-hidden />
                  {deliveryOptions.length ? 'Refresh delivery options' : 'Show delivery options'}
                </Button>

                {deliveryError && <Alert tone="warning">{deliveryError}</Alert>}
              </div>
            </section>

            {/* 3. Delivery */}
            {deliveryOptions.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-700 text-white text-xs font-extrabold">
                    3
                  </span>
                  How should it get there?
                </h2>

                <div role="radiogroup" aria-label="Delivery option" className="mt-5 space-y-2.5">
                  {deliveryOptions.map((option) => {
                    const key = `${option.provider}:${option.serviceCode}`;
                    const isSelected =
                      selectedDelivery?.provider === option.provider &&
                      selectedDelivery?.serviceCode === option.serviceCode;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedDelivery(option)}
                        className={`w-full text-left rounded-xl border px-4 py-3.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                          isSelected
                            ? 'border-cyan-700 bg-cyan-50 ring-2 ring-cyan-700/20'
                            : 'border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                              {option.label}
                              {!option.isLiveQuote && <Badge tone="amber">Indicative rate</Badge>}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                              {option.description}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {option.etaLabel}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-extrabold text-slate-900">
                            {option.fee === 0 ? 'Free' : peso(option.fee)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                  Rates marked “indicative” are our best estimate — we confirm the exact courier fee
                  with you before dispatch and never charge more without asking.
                </p>
              </section>
            )}

            {/* 4. Payment */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-700 text-white text-xs font-extrabold">
                  4
                </span>
                How would you like to pay?
              </h2>

              <div role="radiogroup" aria-label="Payment method" className="mt-5 space-y-2.5">
                {paymentMethods.map((method) => {
                  const Icon = PAYMENT_ICONS[method.id];
                  const isSelected = paymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!method.available}
                      onClick={() => setPaymentMethod(method.id)}
                      className={`w-full text-left rounded-xl border px-4 py-3.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                        isSelected
                          ? 'border-cyan-700 bg-cyan-50 ring-2 ring-cyan-700/20'
                          : method.available
                            ? 'border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40'
                            : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-5 w-5 shrink-0 mt-0.5 text-cyan-700" aria-hidden />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm flex items-center gap-2 flex-wrap">
                            {method.label}
                            {method.instant && <Badge tone="emerald">Instant</Badge>}
                            {method.feePercent > 0 ? (
                              <Badge tone="amber">+{method.feePercent}% fee</Badge>
                            ) : (
                              <Badge tone="slate">No fee</Badge>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                            {method.available ? method.description : method.unavailableReason}
                          </p>
                          {method.available && method.feePercent > 0 && payable > 0 && (
                            <p className="mt-1 text-xs font-semibold text-amber-800">
                              Processing fee on this order:{' '}
                              {peso(Math.round(payable * (method.feePercent / 100) * 100) / 100)}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {fieldErrors.paymentMethod && (
                <p role="alert" className="mt-2 text-xs text-red-700 font-semibold">
                  {fieldErrors.paymentMethod}
                </p>
              )}

              {codBlocked && (
                <div className="mt-4">
                  <Alert tone="warning">
                    Cash on delivery is available for orders up to {peso(20_000)}. Please choose card,
                    GCash, Maya or bank transfer for this order.
                  </Alert>
                </div>
              )}

              <div className="mt-5">
                <TextAreaField
                  label="Delivery instructions"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  error={fieldErrors.notes}
                  rows={2}
                  placeholder="Gate access, receiving hours, who to ask for…"
                />
              </div>
            </section>
          </div>

          {/* Order summary */}
          <aside className="lg:sticky lg:top-28 h-fit space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-base font-extrabold text-slate-900">Order summary</h2>

              <ul className="mt-4 space-y-3 max-h-64 overflow-y-auto pr-1">
                {items.map(({ product, quantity }) => (
                  <li key={product.id} className="flex gap-3 text-sm">
                    <img
                      src={product.image}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 rounded-lg object-cover bg-slate-200 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 line-clamp-2 leading-snug">
                        {product.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {quantity} × {peso(product.price)}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">
                      {peso(product.price * quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Discount code */}
              <div className="mt-5 pt-4 border-t border-slate-200">
                <label
                  htmlFor="discount"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2"
                >
                  <Tag className="inline h-3.5 w-3.5 mr-1 -mt-0.5" aria-hidden />
                  Discount code
                </label>
                <div className="flex gap-2">
                  <input
                    id="discount"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm uppercase focus:outline-2 focus:outline-cyan-600"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={applyDiscount}
                    loading={checkingDiscount}
                  >
                    Apply
                  </Button>
                </div>
                {discountError && (
                  <p role="alert" className="mt-1.5 text-xs text-red-700">
                    {discountError}
                  </p>
                )}
                {discount && (
                  <p className="mt-1.5 text-xs text-emerald-700 font-semibold">
                    {discount.code} applied{discount.label ? ` — ${discount.label}` : ''}
                  </p>
                )}
              </div>

              {/* Totals */}
              <dl className="mt-5 pt-4 border-t border-slate-200 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Subtotal</dt>
                  <dd className="font-semibold text-slate-900">{peso(subtotal)}</dd>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Discount</dt>
                    <dd className="font-semibold">− {peso(discountAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-600">VAT (12%)</dt>
                  <dd className="font-semibold text-slate-900">{peso(vat)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">
                    Delivery
                    {selectedDelivery && (
                      <span className="block text-[11px] text-slate-400">
                        {selectedDelivery.label}
                      </span>
                    )}
                  </dt>
                  <dd className="font-semibold text-slate-900">
                    {selectedDelivery ? (deliveryFee === 0 ? 'Free' : peso(deliveryFee)) : '—'}
                  </dd>
                </div>
                {processingFee > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-slate-600">
                      Processing fee
                      <span className="block text-[11px] text-slate-400">
                        {feePercent}% — {paymentMethods.find((m) => m.id === paymentMethod)?.label}
                      </span>
                    </dt>
                    <dd className="font-semibold text-slate-900">{peso(processingFee)}</dd>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-3 mt-1 border-t border-slate-300">
                  <dt className="font-extrabold text-slate-900">Total</dt>
                  <dd className="text-2xl font-extrabold text-cyan-800">{peso(total)}</dd>
                </div>
                {feePercent > 0 && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Bank deposit and cash on delivery carry no processing fee.
                  </p>
                )}
              </dl>

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                disabled={!selectedDelivery || !paymentMethod || codBlocked}
                className="mt-5"
              >
                <Lock className="h-4 w-4" aria-hidden />
                Place order · {peso(total)}
              </Button>

              {!selectedDelivery && (
                <p className="mt-2 text-[11px] text-center text-slate-500">
                  Enter your address above and choose a delivery option to continue.
                </p>
              )}

              <p className="mt-3 text-[11px] text-slate-500 leading-relaxed flex gap-1.5">
                <Lock className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden />
                Card and e-wallet payments are handled on our provider's secure page. We never see or
                store your card details.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-cyan-700" aria-hidden />
                Prefer to talk it through?
              </p>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                Call {primaryHotline} during {company.hours.label}, or{' '}
                <Link to="/quote" className="font-semibold text-cyan-700 hover:underline">
                  request a formal quotation
                </Link>{' '}
                if your organisation needs one before purchase.
              </p>
            </div>
          </aside>
        </form>
      </Section>
    </>
  );
}
