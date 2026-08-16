import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { env, isProduction } from './env.js';
import { sessions } from './db.js';
import { seedIfEmpty } from './seed.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter } from './routes/public.js';
import { webhookRouter } from './routes/webhooks.js';
import { buildRobotsTxt, buildSitemapXml } from './lib/seo.js';
import { startInventoryWorker } from './lib/inventory-queue.js';

const app = express();

// Behind nginx on IONOS, so trust the proxy for client IPs (rate limiting) and
// for knowing the request arrived over HTTPS (secure cookies).
app.set('trust proxy', 1);

/**
 * The checkout map is third-party JavaScript, so it needs holes in the policy —
 * and it only gets them when it is actually switched on. A site running without
 * GOOGLE_MAPS_BROWSER_KEY keeps the tighter policy rather than carrying an
 * exception for a feature nobody is using.
 */
const MAPS_ORIGINS = env.googleMapsBrowserKey
  ? ['https://maps.googleapis.com', 'https://maps.gstatic.com']
  : [];

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Tailwind injects styles at runtime, so inline styles must be allowed.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        scriptSrc: ["'self'", ...MAPS_ORIGINS],
        imgSrc: ["'self'", 'data:', 'https:'],
        // Maps runs its tile and geocoding calls from a blob worker.
        workerSrc: env.googleMapsBrowserKey ? ["'self'", 'blob:'] : ["'self'"],
        connectSrc: ["'self'", 'https://api.paymongo.com', ...MAPS_ORIGINS],
        // The hosted payment page and Messenger chat open in frames.
        frameSrc: ["'self'", 'https://checkout.paymongo.com', 'https://www.facebook.com'],
        formAction: ["'self'", 'https://checkout.paymongo.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    // Product photos are hot-linked from image CDNs.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(compression());
app.use(cookieParser());

/**
 * In development the Vite dev server runs on a different port, so it needs
 * explicit CORS with credentials for the admin session cookie. In production
 * the client is served from this same origin and no CORS is involved.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && env.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Webhooks are mounted before the JSON parser: signature verification needs the
// raw bytes exactly as the gateway sent them.
app.use('/api/webhooks', webhookRouter);

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api', publicRouter);
app.use('/api/admin', adminRouter);

/* --------------------------------------------------------------- SEO files */

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(buildRobotsTxt());
});

app.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').send(buildSitemapXml());
});

/* ------------------------------------------------------- static client build */

const indexHtml = path.join(env.clientDist, 'index.html');
const clientBuilt = fs.existsSync(indexHtml);

if (clientBuilt) {
  // Hashed asset filenames can be cached hard; index.html never is, so a deploy
  // takes effect immediately.
  app.use(
    express.static(env.clientDist, {
      index: false,
      maxAge: '1y',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  // Client-side routing: any non-API path returns the app shell.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    // Keep the admin panel and anything carrying a customer's reference out of
    // search results, even if a URL is shared or leaks into a referrer header.
    if (/^\/(?:checkout|order\/|booking\/|quote\/)/.test(req.path) || req.path.startsWith(`/${env.adminPath}`)) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
    res.sendFile(indexHtml);
  });
} else {
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res
      .status(503)
      .type('text/plain')
      .send('The website has not been built yet. Run "npm run build" and start the server again.');
  });
}

/* ------------------------------------------------------------ error handling */

app.use((req, res) => {
  res.status(404).json({ error: `No API route matches ${req.method} ${req.path}.` });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Something went wrong on our end. Please try again, or call our hotline if it persists.',
  });
});

/* -------------------------------------------------------------------- start */

seedIfEmpty();

// Delivers paid orders to the inventory system, retrying anything that did not
// get through while it was unreachable.
startInventoryWorker();

// Expired admin sessions are cleaned up hourly rather than left to accumulate.
sessions.purgeExpired();
setInterval(() => sessions.purgeExpired(), 60 * 60 * 1000).unref();

app.listen(env.port, env.host, () => {
  console.info(`\n  HDS Trading OPC server running on http://${env.host}:${env.port}`);
  console.info(`  Public site : ${env.siteUrl}`);
  console.info(`  Admin panel : ${env.siteUrl}/${env.adminPath}`);
  console.info(`  Client build: ${clientBuilt ? env.clientDist : 'not built yet'}\n`);
});
