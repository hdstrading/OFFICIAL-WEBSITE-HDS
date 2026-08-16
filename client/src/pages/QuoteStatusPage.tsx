import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { api } from '../lib/api';
import { formatDateTime, peso } from '../lib/format';
import { Seo } from '../lib/seo';
import { usePrimaryHotline } from '../lib/company';
import type { QuoteRequest } from '../types';
import { Alert, Badge, Button, Section, Spinner } from '../components/ui';

const URGENCY_LABELS: Record<string, string> = {
  routine: 'Routine — within 5 working days',
  urgent: 'Urgent — within 48 hours',
  immediate: 'Immediate — same day',
};

export default function QuoteStatusPage() {
  const primaryHotline = usePrimaryHotline();
  const { reference = '' } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = searchParams.get('new') === '1';

  const [quote, setQuote] = useState<QuoteRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .quote(reference)
      .then((data) => setQuote(data.quote))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [reference]);

  if (loading) return <Spinner label="Looking up your quotation…" />;

  if (error || !quote) {
    return (
      <Section className="py-16">
        <Alert tone="error" title="We could not find that quotation">
          {error ?? 'Please check the reference and try again.'}{' '}
          <Link to="/track" className="underline font-semibold">
            Search again
          </Link>
        </Alert>
      </Section>
    );
  }

  return (
    <>
      <Seo
        title={`Quotation ${quote.reference}`}
        description="Your HDS Trading quotation request."
        path={`/quote/${quote.reference}`}
        noindex
      />

      <Section className="py-10 max-w-3xl">
        {isNew && (
          <div className="mb-6">
            <Alert tone="success" title="Your request is with our sales desk">
              We have emailed a copy to <strong>{quote.email}</strong>. A sales officer will send your
              formal quotation {URGENCY_LABELS[quote.urgency].toLowerCase()}.
            </Alert>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">
                Quotation reference
              </p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900 font-mono">
                {quote.reference}
              </p>
              <p className="mt-1.5 text-sm text-slate-500">
                Requested {formatDateTime(quote.createdAt)}
              </p>
            </div>
            <Badge tone="cyan">{quote.status}</Badge>
          </div>

          <dl className="mt-6 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">For</dt>
              <dd className="font-semibold text-slate-900 text-right">{quote.institutionName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Contact</dt>
              <dd className="font-semibold text-slate-900 text-right">
                {quote.clientName} · {quote.phone}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Urgency</dt>
              <dd className="font-semibold text-slate-900 text-right">
                {URGENCY_LABELS[quote.urgency]}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Deliver to</dt>
              <dd className="font-semibold text-slate-900 text-right">{quote.address}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <h2 className="text-base font-extrabold text-slate-900 px-6 pt-6 flex items-center gap-2">
            <FileText className="h-4.5 w-4.5 text-cyan-700" aria-hidden />
            Items requested
          </h2>

          <ul className="mt-4 divide-y divide-slate-100">
            {quote.items.map((item) => (
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
              <dd className="font-semibold text-slate-900">{peso(quote.subtotal)}</dd>
            </div>
            {quote.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Discount {quote.discountCode && `(${quote.discountCode})`}</dt>
                <dd className="font-semibold">− {peso(quote.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-600">VAT (12%)</dt>
              <dd className="font-semibold text-slate-900">{peso(quote.vat)}</dd>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200">
              <dt className="font-extrabold text-slate-900">Indicative total</dt>
              <dd className="font-extrabold text-slate-900 text-lg">{peso(quote.total)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6">
          <Alert tone="info" title="These are list prices">
            Your formal quotation may come in lower. Our sales officer applies volume and contract
            pricing before sending the document you can submit for approval. Questions in the meantime
            — call {primaryHotline} and quote {quote.reference}.
          </Alert>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/products">
            <Button variant="secondary">Continue browsing</Button>
          </Link>
          <Link to="/contact">
            <Button variant="ghost">Contact our sales desk</Button>
          </Link>
        </div>
      </Section>
    </>
  );
}
