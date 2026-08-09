import { Link } from 'react-router-dom';
import { CalendarCheck, Sparkles } from 'lucide-react';
import { useCatalog } from '../lib/catalog';
import { Seo, breadcrumbSchema } from '../lib/seo';
import { ServiceCard } from '../components/CatalogCards';
import { Alert, Button, PageHeader, Section, Spinner } from '../components/ui';

export default function ServicesPage() {
  const { services, loading, error, reload } = useCatalog();

  return (
    <>
      <Seo
        title="Cleaning, sanitation & pool maintenance services"
        description="Deep cleaning, bio-hazard sanitation and professional pool water treatment for hotels, resorts, clinics and institutions. Check live availability and book a crew online."
        path="/services"
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Services', path: '/services' },
        ])}
      />

      <PageHeader
        eyebrow="Services"
        title="Cleaning & pool care programmes"
        description="Trained crews, our own equipment and chemicals, and a written service report at the end of every visit. Pick a service to see what is included, then check which dates are still open."
      >
        <Link to="/book">
          <Button size="lg">
            <CalendarCheck className="h-4 w-4" aria-hidden />
            See available dates
          </Button>
        </Link>
      </PageHeader>

      <Section className="py-10">
        {loading ? (
          <Spinner label="Loading our services…" />
        ) : error ? (
          <Alert tone="error" title="We could not load our services">
            {error}{' '}
            <button onClick={reload} className="underline font-semibold">
              Try again
            </button>
          </Alert>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}

        <div className="mt-14 rounded-3xl border border-slate-200 bg-slate-50 p-8 sm:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6 justify-between">
            <div className="max-w-2xl">
              <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-cyan-700" aria-hidden />
                Need a recurring contract?
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Weekly pool servicing, monthly deep cleans or a full housekeeping supply programme — we
                will scope it on site and quote a fixed monthly rate, with priority dispatch for
                contract clients.
              </p>
            </div>
            <Link to="/contact" className="shrink-0">
              <Button size="lg">Talk to our team</Button>
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
