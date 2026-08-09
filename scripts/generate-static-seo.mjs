#!/usr/bin/env node
/**
 * Writes robots.txt and sitemap.xml into the built website.
 *
 * Only needed for the split setup, where the site is static on the IONOS
 * webspace. When everything runs on one VPS the Node server generates both
 * files on the fly and this script is unnecessary.
 *
 * Product and service pages are pulled from the live API so the sitemap covers
 * the real catalog. If the API cannot be reached the script still writes a
 * sitemap of the fixed pages and says so, rather than failing the build — a
 * slightly incomplete sitemap is better than no deploy.
 *
 * Usage:
 *   node scripts/generate-static-seo.mjs
 *
 * Reads SITE_URL, VITE_API_BASE_URL and ADMIN_PATH from the environment
 * (or .env), the same values the rest of the deployment uses.
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env reader — avoids depending on the server's node_modules. */
function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadEnvFile();

const SITE_URL = (process.env.SITE_URL ?? 'https://hdstradingopc.com').replace(/\/+$/, '');
const API_BASE = (process.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const OUT_DIR = path.join(ROOT, 'client', 'dist');

const escapeXml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/products', changefreq: 'daily', priority: '0.9' },
  { path: '/services', changefreq: 'weekly', priority: '0.9' },
  { path: '/book', changefreq: 'daily', priority: '0.8' },
  { path: '/reviews', changefreq: 'weekly', priority: '0.6' },
  { path: '/about', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.7' },
  { path: '/track', changefreq: 'monthly', priority: '0.4' },
];

async function fetchCatalogPages() {
  if (!API_BASE) {
    console.warn(
      'VITE_API_BASE_URL is not set — the sitemap will list the fixed pages only.\n' +
        'Set it to your API address (e.g. https://api.hdstradingopc.com) to include products and services.',
    );
    return [];
  }

  try {
    const response = await fetch(`${API_BASE}/api/catalog`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`API responded ${response.status}`);

    const { products = [], services = [] } = await response.json();
    return [
      ...products.map((p) => ({ path: `/products/${p.id}`, changefreq: 'weekly', priority: '0.7' })),
      ...services.map((s) => ({ path: `/services/${s.id}`, changefreq: 'weekly', priority: '0.7' })),
    ];
  } catch (error) {
    console.warn(
      `Could not reach the API at ${API_BASE} (${error.message}).\n` +
        'Writing a sitemap of the fixed pages only. Re-run this script once the API is up.',
    );
    return [];
  }
}

const catalogPages = await fetchCatalogPages();
const lastmod = new Date().toISOString().slice(0, 10);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...STATIC_PAGES, ...catalogPages]
  .map(
    (entry) => `  <url>
    <loc>${escapeXml(`${SITE_URL}${entry.path}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

// The admin path is deliberately absent: robots.txt is public, so a Disallow
// line would advertise the URL we are keeping unguessable. The .htaccess sends
// noindex headers for it instead.
const robots = `User-agent: *
Allow: /
Disallow: /checkout
Disallow: /order/
Disallow: /booking/
Disallow: /quote/

Sitemap: ${SITE_URL}/sitemap.xml
`;

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemap);
writeFileSync(path.join(OUT_DIR, 'robots.txt'), robots);

console.info(
  `Wrote robots.txt and sitemap.xml to client/dist ` +
    `(${STATIC_PAGES.length} fixed pages, ${catalogPages.length} catalog pages).`,
);
