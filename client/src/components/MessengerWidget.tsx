import { useState } from 'react';
import { MessageCircle, Phone, X } from 'lucide-react';
import { SITE, telHref } from '../config/site';

/**
 * Floating contact launcher. Deliberately a plain link to Messenger rather than
 * Facebook's embedded chat SDK — no third-party script, no tracking cookie, and
 * it works with our content security policy.
 */
export default function MessengerWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-3 print:hidden">
      {open && (
        <div className="w-72 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="bg-cyan-700 px-4 py-3">
            <p className="text-sm font-bold text-white">Need help choosing?</p>
            <p className="text-xs text-cyan-100 mt-0.5">{SITE.hours.label}</p>
          </div>
          <div className="p-3 space-y-2">
            <a
              href={SITE.social.messenger}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-cyan-300 hover:bg-cyan-50/50 transition-colors"
            >
              <MessageCircle className="h-5 w-5 text-cyan-700 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">Chat on Messenger</span>
                <span className="block text-xs text-slate-500">Usually replies within the hour</span>
              </span>
            </a>
            <a
              href={telHref(SITE.hotlines[0].numbers[0])}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-cyan-300 hover:bg-cyan-50/50 transition-colors"
            >
              <Phone className="h-5 w-5 text-cyan-700 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">
                  {SITE.hotlines[0].numbers[0]}
                </span>
                <span className="block text-xs text-slate-500">Taytay sales desk</span>
              </span>
            </a>
            <a
              href={`mailto:${SITE.email.primary}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-cyan-300 hover:bg-cyan-50/50 transition-colors"
            >
              <span aria-hidden className="text-lg leading-none">
                ✉️
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900">Email us</span>
                <span className="block text-xs text-slate-500 truncate">{SITE.email.primary}</span>
              </span>
            </a>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close contact options' : 'Open contact options'}
        className="grid h-13 w-13 place-items-center rounded-full bg-cyan-700 text-white shadow-lg hover:bg-cyan-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
