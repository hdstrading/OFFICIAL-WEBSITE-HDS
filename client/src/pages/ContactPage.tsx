import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarCheck,
  Clock,
  Facebook,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from 'lucide-react';
import { SITE, telHref } from '../config/site';
import { Seo, breadcrumbSchema, organizationSchema } from '../lib/seo';
import { Button, PageHeader, Section } from '../components/ui';

/** The three things people usually contact us about, with a direct route each. */
const QUICK_ACTIONS = [
  {
    to: '/quote',
    icon: FileText,
    title: 'Need a quotation?',
    body: 'Build a list from our catalog and we will send a VAT-registered quotation.',
  },
  {
    to: '/book',
    icon: CalendarCheck,
    title: 'Need a cleaning crew?',
    body: 'See which dates are open and reserve a slot without waiting for a callback.',
  },
  {
    to: '/track',
    icon: Clock,
    title: 'Checking an order?',
    body: 'Look it up with your reference number — no account needed.',
  },
];

export default function ContactPage() {
  return (
    <>
      <Seo
        title="Contact HDS Trading OPC"
        description={`Reach HDS Trading OPC in Taytay, Taguig and Tacloban. Call our hotlines, email our sales desks, or chat on Messenger. ${SITE.hours.label}.`}
        path="/contact"
        structuredData={[
          organizationSchema,
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Contact', path: '/contact' },
          ]),
        ]}
      />

      <PageHeader
        eyebrow="Contact"
        title="Talk to us"
        description={`Our sales desks answer during ${SITE.hours.label}. For anything urgent outside those hours, contract clients can reach our emergency dispatch line.`}
      />

      <Section className="py-12">
        {/* Quick routes */}
        <div className="grid gap-5 md:grid-cols-3">
          {QUICK_ACTIONS.map(({ to, icon: Icon, title, body }) => (
            <Link
              key={to}
              to={to}
              className="group rounded-2xl border border-slate-200 bg-white p-5 hover:border-cyan-300 hover:shadow-md transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            >
              <Icon className="h-6 w-6 text-cyan-700" aria-hidden />
              <h2 className="mt-3 font-bold text-slate-900">{title}</h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{body}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          {/* Hotlines */}
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Phone className="h-5 w-5 text-cyan-700" aria-hidden />
              Branch hotlines
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Tap any number to call. All lines are answered {SITE.hours.label}.
            </p>

            <div className="mt-5 space-y-4">
              {SITE.hotlines.map((branch) => (
                <div key={branch.branch} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    {branch.branch}
                  </h3>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {branch.numbers.map((number) => (
                      <li key={number}>
                        <a
                          href={telHref(number)}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono font-semibold text-slate-800 hover:border-cyan-300 hover:bg-cyan-50/50 transition-colors"
                        >
                          <Phone className="h-3.5 w-3.5 text-cyan-700 shrink-0" aria-hidden />
                          {number}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Emergency */}
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5">
              <h3 className="text-sm font-extrabold text-red-900 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {SITE.emergency.label}
              </h3>
              <p className="mt-2 text-sm text-red-800 leading-relaxed">{SITE.emergency.note}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {SITE.emergency.numbers.map((number) => (
                  <li key={number}>
                    <a
                      href={telHref(number)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition-colors"
                    >
                      <Phone className="h-3 w-3" aria-hidden />
                      {number}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Email, chat, address */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Mail className="h-4.5 w-4.5 text-cyan-700" aria-hidden />
                Email
              </h2>

              <div className="mt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Sales &amp; procurement
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {SITE.email.sales.map((address) => (
                    <li key={address}>
                      <a
                        href={`mailto:${address}`}
                        className="text-sm font-semibold text-cyan-700 hover:underline break-all"
                      >
                        {address}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Corporate enquiries
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {SITE.email.corporate.map((address) => (
                    <li key={address}>
                      <a
                        href={`mailto:${address}`}
                        className="text-sm font-semibold text-indigo-700 hover:underline break-all"
                      >
                        {address}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-4 text-xs text-slate-500">
                We aim to reply within one working hour during business hours.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <MessageCircle className="h-4.5 w-4.5 text-cyan-700" aria-hidden />
                Chat with us
              </h2>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Our Messenger desk is usually the fastest way to get a quick answer on stock, pricing
                or delivery timing.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <a href={SITE.social.messenger} target="_blank" rel="noreferrer">
                  <Button>
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    Open Messenger
                  </Button>
                </a>
                <a href={SITE.social.facebook} target="_blank" rel="noreferrer">
                  <Button variant="secondary">
                    <Facebook className="h-4 w-4" aria-hidden />
                    Our Facebook page
                  </Button>
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <MapPin className="h-4.5 w-4.5 text-cyan-700" aria-hidden />
                Registered office
              </h2>
              <address className="mt-2.5 not-italic text-sm text-slate-600 leading-relaxed">
                <strong className="block text-slate-900">{SITE.legalName}</strong>
                {SITE.office.full}
              </address>
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <Clock className="h-4 w-4 text-cyan-700 shrink-0" aria-hidden />
                {SITE.hours.label}
              </p>
              <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                Warehouse pickup is available by arrangement — place your order online, choose
                “Pick up at our warehouse”, and we will text you when it is packed.
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
