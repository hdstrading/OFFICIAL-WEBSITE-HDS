import { siteSettings } from '../db.js';

/**
 * The company details the website shows, assembled from the database with the
 * original hard-coded values as the fallback.
 *
 * Two rules make this safe to edit from the portal without anyone being able to
 * break the site by accident:
 *
 *   1. A key that has never been saved falls back to the default below, so a
 *      fresh install and an upgraded one look identical.
 *   2. A key saved as an empty string also falls back. Clearing a field in the
 *      settings form therefore restores the default rather than leaving a blank
 *      space in the footer where the phone number used to be.
 *
 * Lists are stored as plain text — one entry per line — because the person
 * editing them is a business owner, not a developer. Parsing happens here.
 */

export const SITE_DEFAULTS: Record<string, string> = {
  legalName: 'HDS Trading OPC',
  shortName: 'HDS Trading',
  tagline: 'Institutional Cleaning Supplies, Equipment & Pool Care',
  description:
    'HDS Trading OPC supplies hospital-grade cleaning chemicals, janitorial equipment and professional pool care to hotels, resorts, clinics and institutions across the Philippines. Request a quote or book an on-site inspection online.',
  registration: 'SEC-registered One Person Corporation (OPC), Philippines',

  addressStreet: 'Taytay',
  addressRegion: 'Rizal',
  addressCountry: 'Philippines',
  addressFull: 'Taytay, Rizal, Philippines',

  hoursLabel: 'Monday – Saturday, 8:00 AM – 6:00 PM',
  hoursSchema: 'Mo-Sa 08:00-18:00',

  emailPrimary: 'hanepditoshop@gmail.com',
  emailSales: [
    'Sales2.hdstradingopc@gmail.com',
    'Sales3.hdstradingopc@gmail.com',
    'Sales4.hdstradingopc@gmail.com',
  ].join('\n'),
  emailCorporate: ['hanepditoshop@gmail.com', 'Cleankingcgtph@gmail.com'].join('\n'),

  socialFacebook: 'https://www.facebook.com/hdstrading2022',
  socialMessenger: 'https://m.me/hdstrading2022',

  hotlines: [
    'Taytay: 0917 163 7359, 0967 031 5098, 0917 137 5866, 0927 422 1888, 0956 278 1780, 0995 732 9539',
    'Taguig: 0945 163 7584',
    'Tacloban: 0917 159 5077, 0917 110 8020',
  ].join('\n'),

  emergencyLabel: '24/7 Pool Emergency Dispatch',
  emergencyNote:
    'For active resort retainer clients — algae blooms, pH swings or pump failures during events.',
  emergencyNumbers: ['0917 163 7359', '0967 031 5098', '0917 137 5866'].join('\n'),

  deliveryFreeThreshold: '5000',
  deliveryNote: 'Free delivery within Metro Manila and Rizal on orders over ₱5,000.',
};

/** Every stored value, with defaults filled in. This is what the settings form edits. */
export function settingsWithDefaults(): Record<string, string> {
  const stored = siteSettings.all();
  const merged: Record<string, string> = { ...SITE_DEFAULTS };
  for (const [key, value] of Object.entries(stored)) {
    if (value.trim()) merged[key] = value;
  }
  return merged;
}

const lines = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Splits `Taytay: 0917 163 7359, 0967 031 5098` into a branch and its numbers.
 *
 * A line with no colon is treated as one number under an unnamed branch, so a
 * hurried edit still shows the number rather than swallowing it.
 */
function parseHotlines(value: string): { branch: string; numbers: string[] }[] {
  return lines(value)
    .map((line) => {
      const at = line.indexOf(':');
      const branch = at === -1 ? '' : line.slice(0, at).trim();
      const rest = at === -1 ? line : line.slice(at + 1);
      const numbers = rest
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      return { branch, numbers };
    })
    .filter((group) => group.numbers.length > 0);
}

export interface SiteInfo {
  legalName: string;
  shortName: string;
  tagline: string;
  description: string;
  registration: string;
  office: { street: string; region: string; country: string; full: string };
  hours: { label: string; schema: string };
  email: { primary: string; sales: string[]; corporate: string[] };
  social: { facebook: string; messenger: string };
  hotlines: { branch: string; numbers: string[] }[];
  emergency: { label: string; note: string; numbers: string[] };
  delivery: { freeThreshold: number; note: string };
}

/** The shape the website consumes, built from the flat key/value settings. */
export function buildSiteInfo(): SiteInfo {
  const s = settingsWithDefaults();
  const threshold = Number(s.deliveryFreeThreshold);

  return {
    legalName: s.legalName,
    shortName: s.shortName,
    tagline: s.tagline,
    description: s.description,
    registration: s.registration,
    office: {
      street: s.addressStreet,
      region: s.addressRegion,
      country: s.addressCountry,
      full: s.addressFull,
    },
    hours: { label: s.hoursLabel, schema: s.hoursSchema },
    email: {
      primary: s.emailPrimary,
      sales: lines(s.emailSales),
      corporate: lines(s.emailCorporate),
    },
    social: { facebook: s.socialFacebook, messenger: s.socialMessenger },
    hotlines: parseHotlines(s.hotlines),
    emergency: {
      label: s.emergencyLabel,
      note: s.emergencyNote,
      numbers: lines(s.emergencyNumbers),
    },
    delivery: {
      // A threshold typed as "5,000" or left half-edited must not become NaN and
      // make every order look eligible for free delivery.
      freeThreshold: Number.isFinite(threshold) ? threshold : Number(SITE_DEFAULTS.deliveryFreeThreshold),
      note: s.deliveryNote,
    },
  };
}
