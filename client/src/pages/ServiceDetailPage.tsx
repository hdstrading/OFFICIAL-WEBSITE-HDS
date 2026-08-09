import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarCheck, Check, Repeat, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { peso } from '../lib/format';
import { Seo, breadcrumbSchema, serviceSchema } from '../lib/seo';
import { SERVICE_CATEGORY_LABELS, type Review, type Service } from '../types';
import { Alert, Badge, Button, Section, Spinner, StarRating } from '../components/ui';
import ReviewList from '../components/ReviewList';
import ReviewForm from '../components/ReviewForm';

export default function ServiceDetailPage() {
  const { id = '' } = useParams();

  const [service, setService] = useState<Service | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .service(id)
      .then((data) => {
        setService({ ...data.service, rating: data.rating });
        setReviews(data.reviews);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) return <Spinner label="Loading service…" />;

  if (error || !service) {
    return (
      <Section className="py-16">
        <Alert tone="error" title="We could not find that service">
          {error ?? 'It may no longer be offered.'}{' '}
          <Link to="/services" className="underline font-semibold">
            See all services
          </Link>
        </Alert>
      </Section>
    );
  }

  const bookHref = `/book?service=${encodeURIComponent(service.id)}`;

  return (
    <>
      <Seo
        title={service.name}
        description={service.description.slice(0, 300)}
        path={`/services/${service.id}`}
        image={service.image}
        structuredData={[
          serviceSchema(service),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Services', path: '/services' },
            { name: service.name, path: `/services/${service.id}` },
          ]),
        ]}
      />

      <Section className="py-6">
        <Link
          to="/services"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-cyan-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to all services
        </Link>
      </Section>

      <Section className="pb-14">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="aspect-16/9 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
              <img
                src={service.image}
                alt={service.name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            </div>

            <p className="mt-6 text-xs font-bold uppercase tracking-wider text-emerald-700">
              {SERVICE_CATEGORY_LABELS[service.category]}
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 leading-tight">
              {service.name}
            </h1>
            <p className="mt-1.5 text-base font-semibold text-slate-500">{service.tagline}</p>

            <div className="mt-4">
              <StarRating
                value={service.rating?.average ?? 0}
                count={service.rating?.count ?? 0}
                size="md"
              />
            </div>

            <p className="mt-5 text-slate-600 leading-relaxed">{service.description}</p>

            {service.features.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-extrabold text-slate-900">What the visit includes</h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed">
                      <Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {service.institutionalPros.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-cyan-700" aria-hidden />
                  Why institutions choose this
                </h2>
                <ul className="mt-4 space-y-3">
                  {service.institutionalPros.map((pro) => (
                    <li key={pro} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed">
                      <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-cyan-600" aria-hidden />
                      <span>{pro}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Booking box */}
          <aside className="lg:sticky lg:top-28 h-fit">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-xs font-semibold text-slate-500">Starts at</p>
              <p className="mt-1 text-3xl font-extrabold text-slate-900">
                {peso(service.basePrice)}
                <span className="text-sm font-semibold text-slate-500"> / {service.unit}</span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                Final pricing is confirmed after we see the site. Booking online reserves your slot; a
                down payment holds it.
              </p>

              <Link to={bookHref} className="block mt-5">
                <Button size="lg" fullWidth>
                  <CalendarCheck className="h-4 w-4" aria-hidden />
                  Check available dates
                </Button>
              </Link>

              {service.idealFor.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Ideal for
                  </h3>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {service.idealFor.map((item) => (
                      <li key={item}>
                        <Badge tone="emerald">{item}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {service.frequencyOptions.length > 0 && (
                <div className="mt-5 pt-5 border-t border-slate-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5" aria-hidden />
                    Available frequencies
                  </h3>
                  <ul className="mt-2.5 space-y-1.5 text-sm text-slate-700">
                    {service.frequencyOptions.map((option) => (
                      <li key={option} className="flex gap-2">
                        <Check className="h-3.5 w-3.5 shrink-0 mt-1 text-emerald-600" aria-hidden />
                        {option}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>

        <div className="mt-16 pt-12 border-t border-slate-200 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Customer reviews</h2>
            <div className="mt-5">
              <ReviewList reviews={reviews} />
            </div>
          </div>
          <div>
            <ReviewForm
              subjectType="service"
              subjectId={service.id}
              subjectName={service.name}
              onSubmitted={load}
            />
          </div>
        </div>
      </Section>
    </>
  );
}
