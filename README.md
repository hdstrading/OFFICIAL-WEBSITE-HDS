# HDS Trading OPC — hdstradingopc.com

The official website for HDS Trading OPC: an online shop for institutional
cleaning supplies, a booking system for cleaning and pool services, and a staff
portal to run both.

Built as a **frontend and a backend** in one repository:

| Folder    | What it is                                                              |
| --------- | ----------------------------------------------------------------------- |
| `client/` | The website customers see. React 19 + Vite + Tailwind CSS 4.             |
| `server/` | The API and database. Express + SQLite.                                  |
| `deploy/` | Everything needed to put it live on IONOS.                              |

In production the server serves the built website *and* the API from one
process on one domain, so there is a single thing to deploy and keep running.

---

## What the website does

**For customers**

- Browse and search the full catalog of supplies, equipment and pool chemicals
- Add to cart and **pay online** — credit/debit card, GCash, Maya, online bank
  transfer, manual bank deposit, or cash on delivery
- Choose delivery: our own fleet (free over ₱5,000), warehouse pickup, or
  same-day via **Lalamove** or **Transportify**
- **See which dates and time slots are still open** and book a cleaning or pool
  service, holding the slot with a **down payment**
- Request a formal VAT-registered quotation for procurement approval
- Track any order, booking or quotation with a reference number — no account
  needed
- **Rate and review** products and services; reviews from a real order are
  marked verified

**For staff** (at a secret, unlisted URL)

- Dashboard of revenue, orders, bookings, deposits owed and pending reviews
- Add, edit and remove products and services — changes are live immediately
- Manage orders, mark payments received, book a Lalamove rider
- Manage bookings, record deposits paid, close dates on the booking calendar
- Publish or hide customer reviews
- Create discount codes
- Export orders, bookings and quotations to CSV for Excel or Google Sheets

---

## Running it locally

Requires **Node.js 20 or newer**.

```bash
npm install
cp .env.example .env      # then set ADMIN_PASSWORD and SESSION_SECRET
npm run dev
```

- Website: <http://localhost:3000>
- API: <http://localhost:4000>
- Staff portal: <http://localhost:3000/staff-portal-9f3c>

`npm run dev` starts the API and the website together. The website proxies
`/api` to the server, so both behave exactly as they will in production.

The database is created automatically at `server/data/hds.db` on first run and
filled with a starting catalog.

### Other commands

```bash
npm run build     # build both the website and the server for production
npm start         # run the production build (serves site + API on PORT)
npm run lint      # typecheck both workspaces
```

---

## Deploying

There are two supported topologies. Both use the domain `hdstradingopc.com`.

**Everything on one IONOS VPS — recommended.**
One machine serves the website and the API. One deploy, one certificate, no
CORS. See **[deploy/DEPLOY-IONOS.md](deploy/DEPLOY-IONOS.md)**.

```bash
npm ci && npm run build
systemctl restart hdstradingopc
```

**Website on the IONOS webspace, API on a VPS.**
`hdstradingopc.com` serves static files from IONOS Web Hosting;
`api.hdstradingopc.com` points at the VPS. Useful if you want the hosting
package you already pay for to serve the site. See
**[deploy/DEPLOY-SPLIT.md](deploy/DEPLOY-SPLIT.md)**, which also covers the
trade-offs — you still need the VPS either way.

```bash
VITE_API_BASE_URL=https://api.hdstradingopc.com npm run build:webspace
# upload client/dist/ over SFTP
```

> IONOS *Web Hosting* alone is not enough for either setup — it serves PHP and
> static files only, so it cannot run the API, payments or bookings. A VPS is
> required in both cases.

---

## Configuration

Everything is set through environment variables — see
[`.env.example`](.env.example), which documents each one.

The site is designed to **run with almost nothing configured**. Features whose
credentials are missing disappear cleanly rather than failing at the last step:

| Not configured        | What happens                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| PayMongo              | Card and e-wallet options are hidden; bank transfer and COD still work         |
| SMTP                  | Orders still go through; confirmation emails are logged instead of sent        |
| Lalamove/Transportify | Couriers are still offered at an indicative rate, confirmed before dispatch    |

The two exceptions are `ADMIN_PASSWORD` and `SESSION_SECRET`: in production the
server refuses to start without them, rather than leaving the staff portal open.

---

## How it is put together

### The money is calculated on the server, never the browser

The cart in the browser stores only product ids and quantities. When an order is
placed, the server looks every item up in its own database and recalculates the
price, discount, VAT and delivery from scratch. A tampered request cannot change
what an order costs.

### An order is only paid when the payment provider says so

Landing on the success page proves nothing — anyone can navigate there. Orders
and deposits are marked paid in exactly one place: the webhook handler, and only
after PayMongo's signature over the raw request body verifies. The handler is
idempotent, so a retried webhook never sends a customer two receipts.

### Booking availability is real

The calendar shows how many crews are free per slot, from live data. The same
check runs again when the booking is submitted — because the calendar a customer
is looking at may be minutes old and someone else may have taken the slot since.
That second check is what actually prevents a double booking.

### The staff portal is not discoverable

It lives at a path set by `ADMIN_PATH`, is linked from nowhere on the site, is
served with `noindex` headers, and is *not* listed in `robots.txt` — listing it
there would publish the secret. Its JavaScript is a separate bundle that normal
visitors never download. Access itself is a server-side session cookie with
rate-limited sign-in, so the browser holds no credential a script could read.

---

## Project layout

```
client/
  src/
    components/     Navbar, footer, cart, calendar, cards, form primitives
    pages/          One file per route; admin/ holds the staff portal
    lib/            API client, cart state, catalog loading, SEO, formatting
    config/         site.ts — the domain, hotlines and emails, in one place
server/
  src/
    routes/         public.ts, admin.ts, webhooks.ts
    lib/            pricing, payments, delivery, availability, email, SEO
    data/           the starting catalog used to seed a new database
    db.ts           schema and every query
    validation.ts   input rules, with messages written for customers
deploy/
  DEPLOY-IONOS.md   single-VPS deployment, start here
  DEPLOY-SPLIT.md   webspace + VPS deployment
  nginx.conf        single-VPS: site and API on one domain
  nginx-api-only.conf   split: API subdomain only
  webspace/.htaccess    split: SPA routing and headers for IONOS webspace
  hdstradingopc.service systemd unit
scripts/
  generate-static-seo.mjs   robots.txt and sitemap.xml for static hosting
```

### Changing business details

Phone numbers, email addresses, office address and opening hours are all in
**`client/src/config/site.ts`**. Edit them there once and the navbar, contact
page, footer and structured data all update together.

---

© HDS Trading OPC. SEC-registered One Person Corporation, Philippines.
