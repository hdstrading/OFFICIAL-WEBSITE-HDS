import { Link } from 'react-router-dom';
import { Clock, Facebook, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { SITE, telHref } from '../config/site';
import { useCompany } from '../lib/company';

/** Payment and courier logos are shown as words — no third-party assets to load. */
const PAYMENT_METHODS = ['Visa', 'Mastercard', 'GCash', 'Maya', 'Bank transfer', 'Cash on delivery'];
const COURIERS = ['HDS own fleet', 'Lalamove'];

export default function Footer() {
  const year = new Date().getFullYear();
  const company = useCompany();
  // The Facebook page name, read off whatever URL the owner saved, so the two
  // cannot drift apart the way two separate settings would.
  const facebookHandle = company.social.facebook.replace(/^https?:\/\/(www\.)?facebook\.com\//i, '').replace(/\/+$/, '');

  return (
    <footer className="bg-slate-900 text-slate-300 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Identity */}
          <div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-600 text-white font-extrabold text-sm"
              >
                HDS
              </span>
              <span className="leading-tight">
                <span className="block font-extrabold text-white tracking-tight">{company.legalName}</span>
                <a
                  href={SITE.url}
                  className="block text-[11px] font-semibold uppercase tracking-widest text-cyan-400 hover:text-cyan-300"
                >
                  {SITE.domain}
                </a>
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">{company.description}</p>
            <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-px text-cyan-500" aria-hidden />
              <span>{company.registration}</span>
            </p>
          </div>

          {/* Navigation */}
          <nav aria-label="Footer">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Explore</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                { to: '/products', label: 'Shop supplies & equipment' },
                { to: '/services', label: 'Cleaning & pool services' },
                { to: '/book', label: 'Check available dates' },
                { to: '/reviews', label: 'Customer reviews' },
                { to: '/resources', label: 'News, guides & videos' },
                { to: '/faq', label: 'Frequently asked questions' },
                { to: '/track', label: 'Track an order or booking' },
                { to: '/about', label: 'About HDS Trading' },
                { to: '/contact', label: 'Contact us' },
              ].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-slate-400 hover:text-cyan-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Get in touch</h2>
            <ul className="mt-4 space-y-3.5 text-sm">
              <li className="flex gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-cyan-500" aria-hidden />
                <span className="text-slate-400">{company.office.full}</span>
              </li>
              <li className="flex gap-2.5">
                <Clock className="h-4 w-4 shrink-0 mt-0.5 text-cyan-500" aria-hidden />
                <span className="text-slate-400">{company.hours.label}</span>
              </li>
              <li className="flex gap-2.5">
                <Mail className="h-4 w-4 shrink-0 mt-0.5 text-cyan-500" aria-hidden />
                <a
                  href={`mailto:${company.email.primary}`}
                  className="text-slate-400 hover:text-cyan-400 transition-colors break-all"
                >
                  {company.email.primary}
                </a>
              </li>
              <li className="flex gap-2.5">
                <MessageCircle className="h-4 w-4 shrink-0 mt-0.5 text-cyan-500" aria-hidden />
                <a
                  href={company.social.messenger}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-cyan-400 transition-colors"
                >
                  Chat on Messenger
                </a>
              </li>
              <li className="flex gap-2.5">
                <Facebook className="h-4 w-4 shrink-0 mt-0.5 text-cyan-500" aria-hidden />
                <a
                  href={company.social.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 hover:text-cyan-400 transition-colors"
                >
                  facebook.com/{facebookHandle}
                </a>
              </li>
            </ul>
          </div>

          {/* Hotlines */}
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Branch hotlines</h2>
            <div className="mt-4 space-y-4">
              {company.hotlines.map((branch) => (
                <div key={branch.branch}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-500">
                    {branch.branch}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {branch.numbers.map((number) => (
                      <li key={number}>
                        <a
                          href={telHref(number)}
                          className="text-sm font-mono text-slate-300 hover:text-cyan-400 transition-colors"
                        >
                          {number}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/40 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-red-300">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {company.emergency.label}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-red-200/80">{company.emergency.note}</p>
            </div>
          </div>
        </div>

        {/* Trust row */}
        <div className="mt-12 pt-8 border-t border-slate-800 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">We accept</h2>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((method) => (
                <li
                  key={method}
                  className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-300"
                >
                  {method}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">We deliver with</h2>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {COURIERS.map((courier) => (
                <li
                  key={courier}
                  className="px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-300"
                >
                  {courier}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>
            © {year} {company.legalName}. All rights reserved.
          </p>
          <p>
            <a href={SITE.url} className="hover:text-cyan-400 transition-colors font-semibold">
              {SITE.domain}
            </a>
            <span className="mx-2">·</span>
            Prices in Philippine Peso, VAT-inclusive at checkout.
          </p>
        </div>
      </div>
    </footer>
  );
}
