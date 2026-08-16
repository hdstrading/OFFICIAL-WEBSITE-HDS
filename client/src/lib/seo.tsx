import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE, absoluteUrl } from '../config/site';

/**
 * Per-page SEO. React 19 hoists <title> and <meta> rendered anywhere in the
 * tree into <head>, but tags need to be *replaced* rather than accumulated as
 * the user navigates — so this manages them imperatively against the live
 * document and cleans up nothing that a later page will simply overwrite.
 */

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

/** Replaces the JSON-LD block for the current page. */
function setStructuredData(data: unknown | null) {
  const id = 'page-structured-data';
  document.getElementById(id)?.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export interface SeoProps {
  title: string;
  description: string;
  /** Path only, e.g. "/products". Combined with the site domain for canonical. */
  path?: string;
  image?: string;
  /** Keeps a page out of search results — order pages, admin, checkout. */
  noindex?: boolean;
  structuredData?: unknown;
}

export function Seo({ title, description, path, image, noindex, structuredData }: SeoProps) {
  const location = useLocation();
  const url = absoluteUrl(path ?? location.pathname);
  const ogImage = image ?? absoluteUrl('/og-image.svg');
  // Every page title ends with the brand, so a search result is attributable
  // even when the headline is generic.
  const fullTitle = title.includes(SITE.legalName) ? title : `${title} | ${SITE.legalName}`;

  useEffect(() => {
    document.title = fullTitle;

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large',
    });

    upsertLink('canonical', url);

    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: ogImage });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE.legalName });
    upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'en_PH' });

    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: ogImage });

    setStructuredData(structuredData ?? null);
  }, [fullTitle, description, url, ogImage, noindex, structuredData]);

  return null;
}

/** Organisation and local-business markup, rendered once on the home page. */
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${SITE.url}/#organization`,
  name: SITE.legalName,
  alternateName: SITE.shortName,
  url: SITE.url,
  description: SITE.description,
  email: SITE.email.primary,
  telephone: SITE.hotlines[0].numbers[0],
  priceRange: '₱₱',
  currenciesAccepted: 'PHP',
  paymentAccepted: 'Credit Card, Debit Card, GCash, Maya, Bank Transfer, Cash',
  openingHours: SITE.hours.schema,
  address: {
    '@type': 'PostalAddress',
    addressLocality: SITE.office.street,
    addressRegion: SITE.office.region,
    addressCountry: SITE.office.countryCode,
  },
  areaServed: [
    { '@type': 'AdministrativeArea', name: 'Metro Manila' },
    { '@type': 'AdministrativeArea', name: 'Rizal' },
    { '@type': 'Country', name: 'Philippines' },
  ],
  sameAs: [SITE.social.facebook],
};

/** Breadcrumb markup, so search results show the page's place in the site. */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** Product markup with live price, availability and aggregate rating. */
export function productSchema(product: {
  id: string;
  name: string;
  description: string;
  image: string;
  price: number;
  rating?: { average: number; count: number };
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    brand: { '@type': 'Brand', name: SITE.shortName },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/products/${product.id}`),
      priceCurrency: 'PHP',
      price: product.price,
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: SITE.legalName },
    },
    ...(product.rating && product.rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating.average,
            reviewCount: product.rating.count,
          },
        }
      : {}),
  };
}

/** Service markup for the cleaning programmes. */
export function serviceSchema(service: {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  rating?: { average: number; count: number };
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: { '@type': 'LocalBusiness', name: SITE.legalName, url: SITE.url },
    areaServed: { '@type': 'Country', name: 'Philippines' },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(`/services/${service.id}`),
      priceCurrency: 'PHP',
      price: service.basePrice,
    },
    ...(service.rating && service.rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: service.rating.average,
            reviewCount: service.rating.count,
          },
        }
      : {}),
  };
}
