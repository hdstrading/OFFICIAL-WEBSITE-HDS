import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Seo, breadcrumbSchema } from '../lib/seo';
import { useCompany, usePrimaryHotline } from '../lib/company';
import { Alert, Button, PageHeader, Section } from '../components/ui';

/**
 * One box for every kind of reference. The prefix tells us which page to open,
 * so the customer does not have to know the difference between an order, a
 * booking and a quotation.
 */
export default function TrackPage() {
  const company = useCompany();
  const primaryHotline = usePrimaryHotline();
  const navigate = useNavigate();
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = reference.trim().toUpperCase();

    if (!value) {
      setError('Please enter your reference number.');
      return;
    }

    if (value.includes('-ORD-')) return navigate(`/order/${value}`);
    if (value.includes('-BK-')) return navigate(`/booking/${value}`);
    if (value.includes('-QT-')) return navigate(`/quote/${value}`);

    setError(
      'That does not look like one of our reference numbers. They start with HDS-ORD, HDS-BK or HDS-QT.',
    );
  }

  return (
    <>
      <Seo
        title="Track your order or booking"
        description="Enter your HDS Trading reference number to check the status of an order, a service booking or a quotation request."
        path="/track"
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Track', path: '/track' },
        ])}
      />

      <PageHeader
        eyebrow="Track"
        title="Check your order, booking or quotation"
        description="Enter the reference number from your confirmation email. No account or password needed."
      />

      <Section className="py-12 max-w-2xl">
        <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-slate-200 bg-white p-6">
          <label htmlFor="reference" className="block text-sm font-semibold text-slate-800 mb-1.5">
            Reference number
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="reference"
              value={reference}
              onChange={(e) => {
                setReference(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="HDS-ORD-2026-XXXXXX"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'reference-error' : 'reference-hint'}
              className={`flex-1 rounded-xl border px-3.5 py-3 text-sm font-mono uppercase focus:outline-2 focus:outline-cyan-600 ${
                error ? 'border-red-400 bg-red-50/40' : 'border-slate-300 hover:border-slate-400'
              }`}
            />
            <Button type="submit" size="lg">
              <Search className="h-4 w-4" aria-hidden />
              Look it up
            </Button>
          </div>

          {error ? (
            <p id="reference-error" role="alert" className="mt-2.5 text-xs text-red-700 font-semibold">
              {error}
            </p>
          ) : (
            <p id="reference-hint" className="mt-2.5 text-xs text-slate-500">
              You will find it at the top of the confirmation email we sent you.
            </p>
          )}
        </form>

        <div className="mt-6">
          <Alert tone="info" title="Lost your reference?">
            Call {primaryHotline} during {company.hours.label}, or email{' '}
            <a href={`mailto:${company.email.primary}`} className="underline font-semibold">
              {company.email.primary}
            </a>{' '}
            with the name and date of your order — we will find it for you.
          </Alert>
        </div>

        <dl className="mt-8 grid gap-4 sm:grid-cols-3 text-sm">
          {[
            ['HDS-ORD-…', 'A purchase you paid for or are paying for'],
            ['HDS-BK-…', 'A cleaning or pool service visit'],
            ['HDS-QT-…', 'A quotation request for approval'],
          ].map(([prefix, meaning]) => (
            <div key={prefix} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <dt className="font-mono font-bold text-cyan-800 text-xs">{prefix}</dt>
              <dd className="mt-1 text-xs text-slate-600 leading-relaxed">{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}
