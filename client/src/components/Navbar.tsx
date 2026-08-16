import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { CalendarCheck, Menu, Phone, Search, ShoppingCart, X } from 'lucide-react';
import { SITE, telHref } from '../config/site';
import { useCart } from '../lib/cart';
import { Button } from './ui';

/** The five places a customer actually needs to get to. */
const NAV_LINKS = [
  { to: '/products', label: 'Shop supplies' },
  { to: '/services', label: 'Cleaning services' },
  { to: '/book', label: 'Book a visit' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/about', label: 'About us' },
  { to: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count, open } = useCart();
  const location = useLocation();

  // Close the mobile menu whenever navigation happens, including via back/forward.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  // Stop the page scrolling behind the open mobile menu.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const primaryHotline = SITE.hotlines[0].numbers[0];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      {/* Contact strip — the fastest route to a human. */}
      <div className="bg-slate-900 text-slate-200 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between gap-4">
          <p className="truncate">
            <span className="hidden sm:inline">Institutional cleaning supplies &amp; pool care · </span>
            {SITE.hours.label}
          </p>
          <a
            href={telHref(primaryHotline)}
            className="flex items-center gap-1.5 font-semibold text-white hover:text-cyan-300 transition-colors shrink-0"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            <span>{primaryHotline}</span>
          </a>
        </div>
      </div>

      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Main">
        <div className="h-16 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-600"
          >
            <span
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-700 text-white font-extrabold text-sm"
            >
              HDS
            </span>
            <span className="leading-tight">
              <span className="block font-extrabold text-slate-900 tracking-tight">HDS Trading</span>
              <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {SITE.domain}
              </span>
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                    isActive
                      ? 'text-cyan-800 bg-cyan-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/track"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden xl:inline">Track order</span>
            </Link>

            <Link to="/book" className="hidden sm:block">
              <Button size="sm" variant="secondary">
                <CalendarCheck className="h-4 w-4" aria-hidden />
                Book a visit
              </Button>
            </Link>

            <button
              type="button"
              onClick={open}
              className="relative inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-700 text-white text-sm font-semibold hover:bg-cyan-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700"
              aria-label={`Open cart, ${count} item${count === 1 ? '' : 's'}`}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Cart</span>
              {count > 0 && (
                <span className="min-w-5 h-5 px-1 grid place-items-center rounded-full bg-white text-cyan-800 text-[11px] font-extrabold">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div id="mobile-menu" className="lg:hidden border-t border-slate-200 bg-white">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `block px-3 py-2.5 rounded-lg text-sm font-semibold ${
                    isActive ? 'text-cyan-800 bg-cyan-50' : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <NavLink
              to="/track"
              className="block px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Track my order or booking
            </NavLink>
            <a
              href={telHref(primaryHotline)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-cyan-800 bg-cyan-50"
            >
              <Phone className="h-4 w-4" aria-hidden />
              Call {primaryHotline}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
