import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useCatalog } from '../lib/catalog';
import { Seo, breadcrumbSchema } from '../lib/seo';
import type { Review } from '../types';
import ReviewList from '../components/ReviewList';
import ReviewForm from '../components/ReviewForm';
import {
  Alert,
  PageHeader,
  Section,
  SelectField,
  Spinner,
  StarRating,
} from '../components/ui';

export default function ReviewsPage() {
  const { products, services } = useCatalog();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'product' | 'service'>('all');
  const [subject, setSubject] = useState('');

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .reviews()
      .then((data) => setReviews(data.reviews))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const visible = useMemo(
    () => (filter === 'all' ? reviews : reviews.filter((r) => r.subjectType === filter)),
    [reviews, filter],
  );

  /** Overall average across everything published, for the summary banner. */
  const overall = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const total = reviews.reduce((sum, r) => sum + r.rating, 0);
    return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length };
  }, [reviews]);

  const subjectOptions = filter === 'service' ? services : products;
  const chosen = subjectOptions.find((option) => option.id === subject);

  return (
    <>
      <Seo
        title="Customer reviews & feedback"
        description="Read what hotels, resorts, clinics and institutions say about HDS Trading OPC's cleaning supplies, equipment and pool maintenance services — and leave your own feedback."
        path="/reviews"
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Reviews', path: '/reviews' },
        ])}
      />

      <PageHeader
        eyebrow="Feedback"
        title="What our customers say"
        description="Every review here comes from a real submission and is checked by our team before it is published. Tell us how we did — good or bad, we would rather know."
      >
        {overall.count > 0 && (
          <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3">
            <span className="text-3xl font-extrabold text-slate-900">{overall.average}</span>
            <span>
              <StarRating value={overall.average} count={overall.count} size="md" showCount={false} />
              <span className="block mt-0.5 text-xs text-slate-500">
                from {overall.count} published review{overall.count === 1 ? '' : 's'}
              </span>
            </span>
          </div>
        )}
      </PageHeader>

      <Section className="py-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-6">
              {(['all', 'product', 'service'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                    filter === key
                      ? 'bg-cyan-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {key === 'all' ? 'All reviews' : key === 'product' ? 'Supplies' : 'Services'}
                </button>
              ))}
            </div>

            {loading ? (
              <Spinner label="Loading reviews…" />
            ) : error ? (
              <Alert tone="error" title="We could not load reviews">
                {error}{' '}
                <button onClick={load} className="underline font-semibold">
                  Try again
                </button>
              </Alert>
            ) : (
              <ReviewList reviews={visible} />
            )}
          </div>

          {/* Leave feedback */}
          <aside className="lg:sticky lg:top-28 h-fit space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-slate-900">Leave your feedback</h2>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                Choose what you would like to review, then fill in the form below.
              </p>

              <div className="mt-4 space-y-3">
                <SelectField
                  label="I want to review a…"
                  value={filter === 'all' ? 'product' : filter}
                  onChange={(e) => {
                    setFilter(e.target.value as 'product' | 'service');
                    setSubject('');
                  }}
                >
                  <option value="product">Product or supply</option>
                  <option value="service">Cleaning or pool service</option>
                </SelectField>

                <SelectField
                  label={filter === 'service' ? 'Which service?' : 'Which product?'}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="">Choose one…</option>
                  {subjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            {chosen && (
              <ReviewForm
                key={chosen.id}
                subjectType={filter === 'service' ? 'service' : 'product'}
                subjectId={chosen.id}
                subjectName={chosen.name}
                onSubmitted={load}
              />
            )}
          </aside>
        </div>
      </Section>
    </>
  );
}
