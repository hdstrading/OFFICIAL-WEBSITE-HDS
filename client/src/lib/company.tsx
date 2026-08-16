import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { SITE } from '../config/site';
import type { CompanyInfo } from '../types';

/**
 * The company's contact details, as the super admin last saved them.
 *
 * These used to live in `config/site.ts` and needed a developer and a deploy to
 * change. They now come from the server, so a new branch hotline or a change of
 * office hours is a form the owner fills in.
 *
 * The values in `config/site.ts` remain as the starting point. They are what the
 * page renders on the very first frame, before the fetch returns, and what the
 * site falls back to if the API is briefly unreachable — so a slow network shows
 * a slightly stale phone number rather than an empty space where one should be.
 * The server keeps the same defaults, which is what keeps the two in step.
 */

/** The build-time defaults, in the shape the server sends. */
export const DEFAULT_COMPANY: CompanyInfo = {
  legalName: SITE.legalName,
  shortName: SITE.shortName,
  tagline: SITE.tagline,
  description: SITE.description,
  registration: SITE.registration,
  office: {
    street: SITE.office.street,
    region: SITE.office.region,
    country: SITE.office.country,
    full: SITE.office.full,
  },
  hours: { label: SITE.hours.label, schema: SITE.hours.schema },
  email: {
    primary: SITE.email.primary,
    sales: [...SITE.email.sales],
    corporate: [...SITE.email.corporate],
  },
  social: { facebook: SITE.social.facebook, messenger: SITE.social.messenger },
  hotlines: SITE.hotlines.map((group) => ({ branch: group.branch, numbers: [...group.numbers] })),
  emergency: {
    label: SITE.emergency.label,
    note: SITE.emergency.note,
    numbers: [...SITE.emergency.numbers],
  },
  delivery: { freeThreshold: SITE.delivery.freeThreshold, note: SITE.delivery.note },
};

const CompanyContext = createContext<CompanyInfo>(DEFAULT_COMPANY);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<CompanyInfo>(DEFAULT_COMPANY);

  useEffect(() => {
    let cancelled = false;
    api
      .siteInfo()
      .then((info) => {
        // An older server that does not send company details yet simply leaves
        // the built-in ones in place.
        if (!cancelled && info.company) setCompany(info.company);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return <CompanyContext.Provider value={company}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyInfo {
  return useContext(CompanyContext);
}

/** Every hotline as one flat list, for the navbar ticker and structured data. */
export function useAllHotlines(): string[] {
  const company = useCompany();
  return useMemo(() => company.hotlines.flatMap((group) => group.numbers), [company]);
}

/**
 * The number to put in front of a customer who needs to call somebody now.
 *
 * Never empty. The hotline list is free text that a super admin edits, and
 * half-finished edits happen — a page that says "call us on" and then stops is
 * worse than one showing the number the site shipped with.
 */
export function usePrimaryHotline(): string {
  const hotlines = useAllHotlines();
  return hotlines[0] ?? DEFAULT_COMPANY.hotlines[0].numbers[0];
}
