import { env } from '../env.js';
import { posts, products, services } from '../db.js';

/**
 * robots.txt and sitemap.xml are generated rather than shipped as static files,
 * so newly added products and services appear without a rebuild — and so the
 * admin path stays out of both no matter what it is set to.
 */

export function buildRobotsTxt(): string {
  // The admin path is deliberately NOT listed here. robots.txt is public, so a
  // Disallow line would advertise the very URL we are keeping unguessable. The
  // admin route serves `noindex` headers instead.
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /checkout',
    'Disallow: /order/',
    'Disallow: /booking/',
    'Disallow: /quote/',
    'Disallow: /api/',
    '',
    `Sitemap: ${env.siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

interface SitemapEntry {
  path: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
}

export function buildSitemapXml(): string {
  const staticPages: SitemapEntry[] = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/products', changefreq: 'daily', priority: '0.9' },
    { path: '/services', changefreq: 'weekly', priority: '0.9' },
    { path: '/book', changefreq: 'daily', priority: '0.8' },
    { path: '/reviews', changefreq: 'weekly', priority: '0.6' },
    { path: '/resources', changefreq: 'weekly', priority: '0.7' },
    { path: '/faq', changefreq: 'monthly', priority: '0.6' },
    { path: '/about', changefreq: 'monthly', priority: '0.6' },
    { path: '/contact', changefreq: 'monthly', priority: '0.7' },
    { path: '/track', changefreq: 'monthly', priority: '0.4' },
  ];

  const catalogPages: SitemapEntry[] = [
    ...products.all().map((p) => ({
      path: `/products/${p.id}`,
      changefreq: 'weekly' as const,
      priority: '0.7',
    })),
    ...services.all().map((s) => ({
      path: `/services/${s.id}`,
      changefreq: 'weekly' as const,
      priority: '0.7',
    })),
  ];

  // Published announcements, articles and videos. FAQs live on one page rather
  // than one each, so they are covered by /faq above.
  const contentPages: SitemapEntry[] = posts
    .published()
    .filter((post) => post.type !== 'faq')
    .map((post) => ({
      path: `/resources/${post.slug}`,
      changefreq: 'monthly' as const,
      priority: '0.6',
    }));

  const lastmod = new Date().toISOString().slice(0, 10);

  const urls = [...staticPages, ...catalogPages, ...contentPages]
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(`${env.siteUrl}${entry.path}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
