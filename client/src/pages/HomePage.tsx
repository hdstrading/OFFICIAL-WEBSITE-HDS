import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  CreditCard,
  Droplets,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react';
import { SITE } from '../config/site';
import { useCatalog } from '../lib/catalog';
import { Seo, organizationSchema } from '../lib/seo';
import { ProductCard, ServiceCard } from '../components/CatalogCards';
import { Button, Section, Spinner } from '../components/ui';

/** The three things a visitor most often wants, stated plainly. */
const ENTRY_POINTS = [
  {
    to: '/products',
    icon: PackageCheck,
    title: 'Order supplies online',
    body: 'Disinfectants, tissue, dispensers, machines and pool chemicals. Pay by card, GCash, Maya or bank transfer.',
    cta: 'Shop the catalog',
  },
  {
    to: '/book',
    icon: CalendarCheck,
    title: 'Book a cleaning visit',
    body: 'See which dates are still open, pick a time slot and reserve it with a down payment. No phone tag.',
    cta: 'Check available dates',
  },
  {
    to: '/quote',
    icon: Sparkles,
    title: 'Request a quotation',
    body: 'Buying for a hotel, resort or clinic? Get a VAT-registered quotation you can submit for approval.',
    cta: 'Request a quote',
  },
];

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: 'Registered and compliant',
    body: `${SITE.registration}. VAT-registered invoicing on every order and quotation.`,
  },
  {
    icon: Truck,
    title: 'Delivery that fits your schedule',
    body: 'Our own fleet, plus Lalamove and Transportify for same-day runs. Free delivery on our fleet over ₱5,000.',
  },
  {
    icon: CreditCard,
    title: 'Pay the way you already pay',
    body: 'Credit and debit cards, GCash, Maya, online bank transfer, manual deposit or cash on delivery.',
  },
  {
    icon: Droplets,
    title: 'Specialists, not generalists',
    body: 'Pool water balancing, bio-hazard sanitation and housekeeping programmes run by trained crews.',
  },
];

const HOW_IT_WORKS = [
  { step: '1', title: 'Choose what you need', body: 'Browse supplies or pick a cleaning service.' },
  { step: '2', title: 'Tell us where', body: 'Enter your delivery address or the site to be serviced.' },
  { step: '3', title: 'Pay securely online', body: 'Card, GCash, Maya, bank transfer — or cash on delivery.' },
  { step: '4', title: 'We deliver or turn up', body: 'Track your order, or meet our crew in your booked slot.' },
];

export default function HomePage() {
  const { products, services, loading, error } = useCatalog();

  const featuredProducts = products.slice(0, 4);
  const featuredServices = services.slice(0, 3);

  return (
    <>
      <Seo
        title={`${SITE.legalName} — ${SITE.tagline}`}
        description={SITE.description}
        path="/"
        structuredData={organizationSchema}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-900">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.25),transparent_60%)]"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-700/50 bg-cyan-950/50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-cyan-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Serving hotels, resorts, clinics &amp; institutions
            </p>

            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.05]">
              Cleaning supplies and pool care,
              <span className="text-cyan-400"> ordered online.</span>
            </h1>

            <p className="mt-5 text-lg text-slate-300 leading-relaxed max-w-2xl">
              HDS Trading OPC supplies hospital-grade chemicals, janitorial equipment and professional
              pool maintenance across the Philippines. Order supplies, book a cleaning crew and pay
              online — all from one place.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/products">
                <Button size="lg">
                  Shop supplies
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <Link to="/book">
                <Button
                  size="lg"
                  variant="secondary"
                  className="bg-white/10 text-white border-white/25 hover:bg-white/20 hover:border-white/40"
                >
                  <CalendarCheck className="h-4 w-4" aria-hidden />
                  Check available dates
                </Button>
              </Link>
            </div>

            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 text-sm">
              {[
                ['Free delivery', 'On our fleet over ₱5,000'],
                ['Same-day dispatch', 'Via Lalamove & Transportify'],
                ['Mon – Sat', '8:00 AM – 6:00 PM'],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-bold text-white">{term}</dt>
                  <dd className="text-slate-400 text-xs mt-0.5">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Three ways in */}
      <Section className="py-14 sm:py-20">
        <div className="grid gap-5 md:grid-cols-3">
          {ENTRY_POINTS.map(({ to, icon: Icon, title, body, cta }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-cyan-300 hover:shadow-lg transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-extrabold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-cyan-700 group-hover:gap-2.5 transition-all">
                {cta}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <section className="bg-slate-50 border-y border-slate-200">
        <Section className="py-14 sm:py-18">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 text-center">
            How ordering works
          </h2>
          <p className="mt-2.5 text-center text-slate-600 max-w-2xl mx-auto">
            Four steps, no account needed. You get a reference number you can use to check progress at
            any time.
          </p>

          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((item) => (
              <li key={item.step} className="relative">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-cyan-700 text-white font-extrabold text-sm">
                  {item.step}
                </span>
                <h3 className="mt-3.5 font-bold text-slate-900">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{item.body}</p>
              </li>
            ))}
          </ol>
        </Section>
      </section>

      {/* Featured products */}
      <Section className="py-14 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Popular supplies
            </h2>
            <p className="mt-2 text-slate-600">Ready to ship from our Taytay warehouse.</p>
          </div>
          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-700 hover:gap-2.5 transition-all"
          >
            View all supplies
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {loading ? (
          <Spinner label="Loading our catalog…" />
        ) : error ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </Section>

      {/* Services */}
      {featuredServices.length > 0 && (
        <section className="bg-slate-50 border-y border-slate-200">
          <Section className="py-14 sm:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  Cleaning &amp; pool programmes
                </h2>
                <p className="mt-2 text-slate-600">
                  Book a crew for a one-off deep clean or a recurring contract.
                </p>
              </div>
              <Link
                to="/services"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-cyan-700 hover:gap-2.5 transition-all"
              >
                View all services
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {featuredServices.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </Section>
        </section>
      )}

      {/* Why us */}
      <Section className="py-14 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 text-center">
          Why institutions buy from us
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3.5 font-bold text-slate-900">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Closing call to action */}
      <Section className="pb-20">
        <div className="rounded-3xl bg-slate-900 px-6 py-12 sm:px-12 sm:py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Need a contract rate for your property?
          </h2>
          <p className="mt-3 text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Tell us your monthly volume and we will put together a supply programme with fixed pricing,
            scheduled deliveries and a dedicated account officer.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Link to="/contact">
              <Button size="lg">Talk to our sales desk</Button>
            </Link>
            <Link to="/quote">
              <Button
                size="lg"
                variant="secondary"
                className="bg-white/10 text-white border-white/25 hover:bg-white/20"
              >
                Request a quotation
              </Button>
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
