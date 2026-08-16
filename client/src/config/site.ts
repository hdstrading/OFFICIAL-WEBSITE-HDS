/**
 * The business details the site ships with.
 *
 * These are no longer where a phone number gets changed: contact details, office
 * hours, addresses, hotlines and the free-delivery threshold are edited by the
 * super admin from the staff portal and served by the API. Use `useCompany()`
 * from `lib/company` to read them.
 *
 * What is left here has two jobs. The domain, the currency and the VAT rate are
 * genuinely build-time — they belong in the code. Everything else is the
 * fallback: what the page shows on the first frame before the API answers, and
 * what it falls back to if the API is unreachable. The server holds the same
 * defaults, so if you change one, change both.
 */

export const SITE = {
  /** Public website address. Used for canonical URLs, sitemap, emails and sharing. */
  domain: 'hdstradingopc.com',
  url: 'https://hdstradingopc.com',

  legalName: 'HDS Trading OPC',
  shortName: 'HDS Trading',
  tagline: 'Institutional Cleaning Supplies, Equipment & Pool Care',
  description:
    'HDS Trading OPC supplies hospital-grade cleaning chemicals, janitorial equipment and professional pool care to hotels, resorts, clinics and institutions across the Philippines. Request a quote or book an on-site inspection online.',

  /** SEC-registered One Person Corporation, Philippines. */
  registration: 'SEC-registered One Person Corporation (OPC), Philippines',
  currency: 'PHP',
  vatRate: 0.12,

  office: {
    label: 'Registered Office',
    street: 'Taytay',
    region: 'Rizal',
    country: 'Philippines',
    countryCode: 'PH',
    full: 'Taytay, Rizal, Philippines',
  },

  hours: {
    label: 'Monday – Saturday, 8:00 AM – 6:00 PM',
    /** schema.org openingHours format. */
    schema: 'Mo-Sa 08:00-18:00',
  },

  email: {
    /** Shown first and used as the default reply-to on the site. */
    primary: 'hanepditoshop@gmail.com',
    sales: [
      'Sales2.hdstradingopc@gmail.com',
      'Sales3.hdstradingopc@gmail.com',
      'Sales4.hdstradingopc@gmail.com',
    ],
    corporate: ['hanepditoshop@gmail.com', 'Cleankingcgtph@gmail.com'],
  },

  social: {
    facebook: 'https://www.facebook.com/hdstrading2022',
    facebookHandle: 'hdstrading2022',
    messenger: 'https://m.me/hdstrading2022',
  },

  /** Branch hotlines, grouped the way a caller thinks about them. */
  hotlines: [
    {
      branch: 'Taytay',
      numbers: [
        '0917 163 7359',
        '0967 031 5098',
        '0917 137 5866',
        '0927 422 1888',
        '0956 278 1780',
        '0995 732 9539',
      ],
    },
    { branch: 'Taguig', numbers: ['0945 163 7584'] },
    { branch: 'Tacloban', numbers: ['0917 159 5077', '0917 110 8020'] },
  ],

  /** 24/7 line for resort clients on an active retainer contract. */
  emergency: {
    label: '24/7 Pool Emergency Dispatch',
    note: 'For active resort retainer clients — algae blooms, pH swings or pump failures during events.',
    numbers: ['0917 163 7359', '0967 031 5098', '0917 137 5866'],
  },

  delivery: {
    freeThreshold: 5000,
    note: 'Free delivery within Metro Manila and Rizal on orders over ₱5,000.',
  },
} as const;

/** Strips spaces so a number can be used in a tel: link. */
export const telHref = (number: string) => `tel:+63${number.replace(/\D/g, '').replace(/^0/, '')}`;

export const absoluteUrl = (path: string) =>
  `${SITE.url}${path.startsWith('/') ? path : `/${path}`}`;
