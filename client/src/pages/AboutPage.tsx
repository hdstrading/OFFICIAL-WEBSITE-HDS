import { Link } from 'react-router-dom';
import { Building2, Droplets, Handshake, PackageCheck, ShieldCheck, Users } from 'lucide-react';
import { SITE } from '../config/site';
import { Seo, breadcrumbSchema } from '../lib/seo';
import { Button, PageHeader, Section } from '../components/ui';

const CAPABILITIES = [
  {
    icon: PackageCheck,
    title: 'Supply',
    body: 'Disinfectants and sanitisers, janitorial tools, tissue and paper, dispensers, laundry care, restaurant supplies and industrial machines — stocked and ready to ship.',
  },
  {
    icon: Droplets,
    title: 'Pool care',
    body: 'Chlorine, stabilisers and balancing chemicals, plus scheduled water testing and treatment programmes for resort and hotel pools.',
  },
  {
    icon: Users,
    title: 'Service crews',
    body: 'Trained teams for deep cleaning, post-construction clean-up, bio-hazard sanitation and recurring housekeeping support.',
  },
  {
    icon: Handshake,
    title: 'Contracts',
    body: 'Fixed monthly pricing, scheduled deliveries and a dedicated account officer for properties that need supply certainty.',
  },
];

const SECTORS = [
  'Hotels and resorts',
  'Hospitals and clinics',
  'Restaurants and food service',
  'Schools and universities',
  'Corporate offices',
  'Condominiums and estates',
  'Government facilities',
  'Manufacturing plants',
];

export default function AboutPage() {
  return (
    <>
      <Seo
        title="About HDS Trading OPC"
        description="HDS Trading OPC is an SEC-registered One Person Corporation supplying institutional cleaning chemicals, janitorial equipment and professional pool care across the Philippines, from our base in Taytay, Rizal."
        path="/about"
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'About', path: '/about' },
        ])}
      />

      <PageHeader
        eyebrow="About us"
        title="Who we are"
        description="HDS Trading OPC supplies and services the properties that cannot afford to get cleaning wrong — hotels, resorts, clinics and institutions across the Philippines."
      />

      <Section className="py-12">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
          <div className="prose-slate max-w-none">
            <h2 className="text-2xl font-extrabold text-slate-900">What we do</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              We started as a supplier of cleaning chemicals and janitorial equipment, and grew into
              the specialist work our customers kept asking for: pool water treatment, deep sanitation
              and recurring housekeeping programmes. Today we do both — we stock what your team needs
              day to day, and we send our own crews when the job needs specialists.
            </p>
            <p className="mt-4 text-slate-600 leading-relaxed">
              Being a One Person Corporation keeps us direct. There is no layer of account managers
              between you and a decision. When you need a price, a delivery moved or a crew dispatched
              for a pool emergency before a function, you talk to someone who can act on it.
            </p>

            <h2 className="mt-12 text-2xl font-extrabold text-slate-900">How we work</h2>
            <ul className="mt-4 space-y-4">
              {[
                [
                  'Everything in writing',
                  'VAT-registered invoices and quotations on every order, formatted so your procurement team can process them without chasing us for details.',
                ],
                [
                  'Delivery that suits the job',
                  'Our own fleet for scheduled and bulk runs — free over ₱5,000 — plus Lalamove and Transportify when you need something the same afternoon.',
                ],
                [
                  'Payment on your terms',
                  'Pay online by card, GCash, Maya or bank transfer, settle by manual deposit against an invoice, or pay our rider on delivery.',
                ],
                [
                  'Emergency cover for contract clients',
                  'Resort clients on a retainer get direct access to our dispatchers for algae blooms, pH swings and pump failures during events.',
                ],
              ].map(([title, body]) => (
                <li key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-bold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-700" aria-hidden />
                Company details
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Registered name</dt>
                  <dd className="font-semibold text-slate-900">{SITE.legalName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Registration</dt>
                  <dd className="font-semibold text-slate-900">{SITE.registration}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Registered office</dt>
                  <dd className="font-semibold text-slate-900">{SITE.office.full}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Branches</dt>
                  <dd className="font-semibold text-slate-900">
                    {SITE.hotlines.map((h) => h.branch).join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Operating hours</dt>
                  <dd className="font-semibold text-slate-900">{SITE.hours.label}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Website</dt>
                  <dd>
                    <a href={SITE.url} className="font-semibold text-cyan-700 hover:underline">
                      {SITE.domain}
                    </a>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-cyan-700" aria-hidden />
                Sectors we serve
              </h2>
              <ul className="mt-3.5 grid grid-cols-1 gap-1.5 text-sm text-slate-600">
                {SECTORS.map((sector) => (
                  <li key={sector} className="flex gap-2">
                    <span aria-hidden className="text-cyan-600">
                      •
                    </span>
                    {sector}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        {/* Capabilities */}
        <div className="mt-16">
          <h2 className="text-2xl font-extrabold text-slate-900 text-center">
            Four things we do well
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-50 text-cyan-700 border border-cyan-100">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-bold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 rounded-3xl bg-slate-900 px-6 py-12 sm:px-12 text-center">
          <h2 className="text-2xl font-extrabold text-white">Let's talk about your property</h2>
          <p className="mt-3 text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Tell us what you clean, how often, and what is not working. We will put together a supply
            and service plan that fits.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            <Link to="/contact">
              <Button size="lg">Contact us</Button>
            </Link>
            <Link to="/book">
              <Button
                size="lg"
                variant="secondary"
                className="bg-white/10 text-white border-white/25 hover:bg-white/20"
              >
                Book a site visit
              </Button>
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
