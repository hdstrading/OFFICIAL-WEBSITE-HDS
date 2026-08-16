import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, ShoppingBag } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useCart } from '../lib/cart';
import { peso } from '../lib/format';
import { Seo, breadcrumbSchema } from '../lib/seo';
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Section,
  SelectField,
  TextAreaField,
  TextField,
} from '../components/ui';

/**
 * The B2B path. Institutions usually cannot pay by card off the shelf — they
 * need a VAT-registered quotation to route through procurement first.
 */
export default function QuotePage() {
  const navigate = useNavigate();
  const { items, subtotal, count, toPayload } = useCart();

  const [clientName, setClientName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [urgency, setUrgency] = useState('routine');
  const [instructions, setInstructions] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const { quote } = await api.requestQuote({
        clientName,
        institutionName,
        email,
        phone,
        address,
        urgency,
        instructions: instructions || undefined,
        items: toPayload(),
      });
      // The cart is deliberately left intact — a quotation is not a purchase,
      // and the customer may still want to buy the same items outright.
      navigate(`/quote/${quote.reference}?new=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields);
      } else {
        setError('Something went wrong. Please try again or call our sales desk.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  if (count === 0) {
    return (
      <>
        <Seo
          title="Request a quotation"
          description="Request a VAT-registered quotation for institutional cleaning supplies and equipment."
          path="/quote"
        />
        <Section className="py-16">
          <EmptyState
            icon={<ShoppingBag className="h-12 w-12" />}
            title="Add items first"
            description="Build your list from our catalog, then come back here and we will turn it into a formal quotation you can submit for approval."
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
        title="Request a quotation"
        description="Request a VAT-registered quotation for institutional cleaning supplies, equipment and pool chemicals. Volume pricing applied for hotels, resorts and clinics."
        path="/quote"
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Request a quotation', path: '/quote' },
        ])}
      />

      <PageHeader
        eyebrow="For institutions"
        title="Request a formal quotation"
        description="Send us your list and we will come back with a VAT-registered quotation, with any volume or contract pricing you qualify for applied. No payment is taken at this stage."
      />

      <Section className="py-10">
        {error && (
          <div className="mb-6">
            <Alert tone="error" title="We could not send your request">
              {error}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">Your details</h2>

            <div className="grid gap-4 sm:grid-cols-2">
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
                label="Company or institution"
                name="institutionName"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                error={fieldErrors.institutionName}
                required
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
                hint="Your quotation is sent here."
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

            <TextAreaField
              label="Delivery address"
              name="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              error={fieldErrors.address}
              required
              rows={2}
              placeholder="Where the goods would be delivered"
            />

            <SelectField
              label="How soon do you need this?"
              name="urgency"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              error={fieldErrors.urgency}
            >
              <option value="routine">Routine — quotation within 5 working days</option>
              <option value="urgent">Urgent — quotation within 48 hours</option>
              <option value="immediate">Immediate — same day, please call me</option>
            </SelectField>

            <TextAreaField
              label="Anything else we should know"
              name="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              error={fieldErrors.instructions}
              rows={3}
              placeholder="Tender reference, payment terms, delivery schedule, accreditation requirements…"
            />

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              <FileText className="h-4 w-4" aria-hidden />
              Send quotation request
            </Button>
          </div>

          <aside className="lg:sticky lg:top-28 h-fit">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-base font-extrabold text-slate-900">Items on your list</h2>

              <ul className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-1 text-sm">
                {items.map(({ product, quantity }) => (
                  <li key={product.id} className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 leading-snug">{product.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {quantity} × {peso(product.price)} per {product.unit}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">
                      {peso(product.price * quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 pt-4 border-t border-slate-200 flex justify-between items-baseline">
                <span className="text-sm font-semibold text-slate-600">Indicative subtotal</span>
                <span className="text-xl font-extrabold text-slate-900">{peso(subtotal)}</span>
              </div>

              <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                List prices before VAT. Your formal quotation may be lower once volume and contract
                pricing are applied — that is exactly what our sales officer will work out for you.
              </p>

              <Link to="/checkout" className="block mt-4">
                <Button variant="secondary" fullWidth>
                  Or buy these outright now
                </Button>
              </Link>
            </div>
          </aside>
        </form>
      </Section>
    </>
  );
}
