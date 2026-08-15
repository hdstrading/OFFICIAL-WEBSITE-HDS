# Connecting the website to the inventory system

The website at `hdstradingopc.com` and the inventory system at
`inventory.hdstradingopc.com` run on two separate IONOS VPSs. This describes how
they talk to each other, what each one owns, and the one change the inventory
system needs before the catalog can flow.

**Nothing in this document has been applied to the inventory system.** The patch
in [What the inventory system needs](#what-the-inventory-system-needs) is a
proposal for review.

---

## Who owns what

| | Inventory system | Website |
| --- | --- | --- |
| Which items are sellable | **Owns** — the *Sales Information* tick | Mirrors |
| Price, SKU, unit, tax rate | **Owns** | Mirrors |
| Stock on hand and available | **Owns** | Mirrors, never writes |
| Sales orders, packages, shipments | **Owns** | Sends orders in |
| Marketing copy, feature bullets, specs | — | **Owns** |
| Product photos | Provides, if set | **Owns** — can override |
| Customer reviews and ratings | — | **Owns** |
| Bookings, quotations, deposits | — | **Owns** |

The split matters because the two systems are good at different things. The
warehouse decides what exists and what it costs; the website decides how it is
described and sold. Neither overwrites the other's half, so a catalog sync never
destroys sales copy and editing sales copy never changes a price.

Items are matched on **SKU**. An item with no SKU cannot appear on the website,
because there is nothing to join it to.

---

## What already works, unchanged

The inventory system's `server/routes/integration.js` provides a
machine-to-machine API that is a close fit for this. It authenticates with a
single bearer key, fails closed when no key is set, and logs every denied
attempt.

| Endpoint | What it does |
| --- | --- |
| `GET /integration/ping` | Health check; confirms the key works and a warehouse is configured |
| `GET /integration/stock` | Per-SKU `on_hand`, `committed` and `available` |
| `POST /integration/orders` | Creates a **confirmed** sales order; idempotent on `reference` |
| `POST /integration/orders/:reference/void` | Releases the stock commitment; refuses once shipped |

Three of its design decisions are worth calling out, because the website is
built to rely on them:

- **Orders are idempotent on `reference`.** The website can safely retry after a
  timeout without booking stock twice. Our order reference (`HDS-ORD-2026-…`) is
  what we send.
- **Orders arrive `confirmed`, not draft.** Stock leaves the saleable pool
  immediately, so the same tin cannot be sold twice while the warehouse picks it.
- **Prices are VAT-inclusive by default** and the line price we send is the price
  the customer actually paid. The sales order total therefore matches the
  customer's receipt to the centavo, rather than being re-priced from the item
  list.

---

## What the inventory system needs

One gap. `GET /integration/stock` returns stock levels but **not prices**, and it
returns every active item with a SKU regardless of whether *Sales Information* is
ticked. So today the website can see how many exist, but not what they cost or
whether they are meant to be sold online.

Everything required is already on the `items` table — `selling_price`,
`tax_rate`, `sales_description`, `image`, `category` and `sell_enabled` (the
column behind the *Sales Information* checkbox). It is only a matter of exposing
them.

### Proposed: a new `/integration/catalog` endpoint

Deliberately a **new** endpoint rather than a change to `/integration/stock`.
Adding a `sell_enabled = 1` filter to the existing one would silently shrink its
response, and anything already relying on it would lose items with no error.
Additive is safe; changing an endpoint's meaning in place is not.

To be added to `server/routes/integration.js`, above the Orders section:

```js
// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * The sellable catalogue, for a storefront to mirror.
 *
 * Distinct from /integration/stock, which answers "how many are there?" for
 * anything countable. This answers "what may be sold online, and for how much?"
 * — a smaller set, gated on the item's Sales Information tick, and carrying the
 * commercial fields a shop needs to list something.
 *
 * Items without a SKU are omitted for the same reason as in /stock: the SKU is
 * the join to the storefront, and an item lacking one cannot be matched to a
 * product there.
 */
router.get('/integration/catalog', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, sku, name, unit, description, sales_description, selling_price,
              tax_rate, image, category, brand, track_inventory
         FROM items
        WHERE type = 'goods'
          AND status = 'active'
          AND sell_enabled = 1
          AND TRIM(COALESCE(sku,'')) <> ''
        ORDER BY name`
    )
    .all();

  const items = rows.map((item) => ({
    sku: item.sku,
    name: item.name,
    unit: item.unit || 'pcs',
    // The sales description is what the seller wrote for buyers; the plain
    // description is internal. Prefer the former, fall back to the latter.
    description: item.sales_description || item.description || '',
    selling_price: item.selling_price,
    tax_rate: item.tax_rate,
    image: item.image || '',
    category: item.category || '',
    brand: item.brand || '',
    tracked: item.track_inventory === 1,
    on_hand: item.track_inventory === 1 ? stockOnHand(item.id) : null,
    available: item.track_inventory === 1 ? availableForSale(item.id) : null,
  }));

  res.json({ ok: true, as_of: new Date().toISOString(), items });
});
```

It uses only helpers the file already imports (`stockOnHand`,
`availableForSale`), adds no dependency, writes nothing, and changes no existing
behaviour.

**Applied** on the branch `feature/integration-catalog-endpoint` in the
inventory repository, after review. Its 322-check suite passes unchanged, and
the endpoint was exercised against a seeded database: an item with Sales
Information unticked and an item with no SKU were both correctly omitted, while
`/integration/stock` continued to return them.

Note the mount point: every route in that application is mounted under `/api`,
so the real paths are `/api/integration/catalog`, `/api/integration/orders` and
so on. `INVENTORY_API_URL` is the bare host — the website adds the prefix.

---

## How the website uses it

### Catalog sync — inventory to website  ⏳ waiting on the endpoint above

A scheduled pull, every `INVENTORY_SYNC_MINUTES` (default 15), plus a **Sync
now** button in the staff portal.

For each item returned:

- **New SKU** → a product is created, using the inventory system's name, price,
  unit and description as its starting point.
- **Known SKU** → price, unit, stock and sellability are updated. The website's
  own fields — feature bullets, specifications, long description, image override,
  category mapping — are left exactly as they are.
- **SKU that stops appearing** (unticked, deactivated, or SKU removed) → the
  product is hidden from the website. It is never deleted, because deleting it
  would take its reviews and its order history with it.

Stock is displayed as availability, not a raw count: *In stock*, *Low stock*, or
*Out of stock*. An exact number goes stale between syncs and invites arguments;
"low stock" stays true for longer and reads better.

### Orders — website to inventory  ✅ built

An order becomes a sales order **once payment is confirmed**:

| Payment method | Sent when |
| --- | --- |
| Card, GCash, Maya, online bank transfer | The payment webhook confirms |
| Bank deposit, cash on delivery | Immediately on placement, since staff settle these later |

This keeps abandoned checkouts out of the warehouse's order list.

Sending is **queued, not inline**. The customer's checkout never waits on the
inventory system, and never fails because of it. If the inventory VPS is
unreachable the order is saved and retried with backoff; the staff portal shows
anything still pending, with a manual retry.

Because the endpoint is idempotent on our reference, a retry after a timeout is
safe even when the first attempt actually succeeded.

### Preventing oversells

Two layers:

1. The website hides anything the last sync reported as unavailable.
2. At checkout, availability is re-checked live before the order is accepted.
   Between a customer loading a page and paying, someone in the warehouse may
   have sold the last one over the counter.

If the inventory system cannot be reached at that moment, checkout proceeds on
the last known figures rather than blocking the sale — an occasional oversell is
a phone call, whereas a checkout that refuses everyone during an outage is lost
revenue.

---

## Verified behaviour

The order push was tested end to end against a stand-in for the inventory API:

| Scenario | Result |
| --- | --- |
| Order with a discount code | Sales order total matched the customer's receipt exactly (₱9,777.60 both sides) |
| Inventory system unreachable | Order accepted, queued, retried automatically |
| Unknown SKU | Marked *needs attention* with the SKU named; no pointless auto-retries |
| Same order pushed twice | No duplicate sales order created |
| Staff "Send all now" after an outage | Backlog delivered immediately, ignoring retry timers |

That first row is the one that mattered most. The inventory system taxes the
pre-discount subtotal while the website taxes the post-discount net, so sending
our discount unchanged would have made every discounted sales order 12% of the
discount higher than what the customer actually paid. The discount is grossed up
by the VAT rate to compensate, and `expectedInventoryTotal()` re-checks the
arithmetic on every push and logs a warning if the two ever disagree.

---

## Setup

### 1. On the inventory system — your side

Apply the endpoint above, then in **Settings → Integration**, set an API key.
Generate one with:

```bash
openssl rand -hex 32
```

Then confirm the endpoint responds:

```bash
curl -H "Authorization: Bearer YOUR_KEY" \
     -H "X-HDS-Client: website" \
     https://inventory.hdstradingopc.com/integration/ping
```

### 2. Network

The website VPS (`217.154.118.223`) must be able to reach the inventory VPS
(`31.70.105.39`) over HTTPS. Two requirements:

- `inventory.hdstradingopc.com` needs a valid TLS certificate. The website
  refuses to send customer data over an untrusted connection, and will not be
  configured to skip that check.
- If the inventory VPS has a firewall, port 443 must accept the website VPS.
  Restricting it to that one address is worth doing:

  ```bash
  ufw allow from 217.154.118.223 to any port 443 proto tcp
  ```

### 3. On the website

```bash
INVENTORY_API_URL=https://inventory.hdstradingopc.com
INVENTORY_API_KEY=the-key-from-settings
INVENTORY_SYNC_MINUTES=15
INVENTORY_PUSH_ORDERS=true
```

Restart, then use **Sync now** in the staff portal under Catalog.

---

## What happens when things break

| Situation | Result |
| --- | --- |
| Inventory system down during browsing | Website serves the last synced catalog; nothing visible changes |
| Inventory system down at checkout | Order is accepted and queued; sales order created when it returns |
| Wrong or missing API key | Sync and pushes fail loudly in the staff portal; the shop keeps working |
| SKU on the website no longer exists | The order is rejected with `unknown_skus`, and the staff portal shows which |
| Item unticked in the inventory system | Hidden from the website at the next sync; existing orders unaffected |
| Same order sent twice | The inventory system returns the original sales order; nothing duplicated |

The rule throughout: **the inventory system being unavailable must never stop
the website taking money.** Orders survive, and reconcile when the link returns.

---

## Proposed: two further changes to the inventory system

Both are for review, like the catalog endpoint was. Neither has been applied.

### 1. Match SKUs case-insensitively

`POST /integration/orders` looks items up with `WHERE sku = ?`, which in SQLite
is case-sensitive on text. A product entered on the website as `hds-luxe-san`
therefore fails against an item stored as `HDS-LUXE-SAN`, with an "unknown SKU"
that looks like a missing item rather than a capitalisation difference.

One line, in `server/routes/integration.js`:

```diff
-    const item = sku ? db.prepare('SELECT id, name, selling_price, tax_rate FROM items WHERE sku = ?').get(sku) : null;
+    // Case-insensitive: a SKU is an identifier, and staff type it into two
+    // different systems. Treating `HDS-001` and `hds-001` as different items
+    // rejects the order with a message that reads like the item is missing.
+    const item = sku
+      ? db.prepare('SELECT id, name, selling_price, tax_rate FROM items WHERE sku = ? COLLATE NOCASE').get(sku)
+      : null;
```

The website now stores SKUs exactly as typed rather than forcing upper case, so
this is what makes the two agree.

### 2. Report order status back

The warehouse knows when an order was packed and when it shipped; the customer
asking "where is my order?" is on the website. There is currently no way for one
to tell the other.

A read-only endpoint, taking the references the website already knows:

```js
/**
 * Progress of website orders, for the storefront to show its customers.
 *
 * Batched deliberately: the storefront polls every open order at once, so this
 * costs one query however many are in flight, rather than one request each.
 *
 * `pick_status` comes from the order's latest pick list, which is where picking
 * lives — the sales order itself goes confirmed → packed without passing
 * through a picked state.
 */
router.get('/integration/orders', (req, res) => {
  const references = String(req.query.references || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, 200); // A storefront with more than 200 orders in flight can page.

  if (!references.length) {
    return res.status(400).json({ error: 'references is required' });
  }

  const placeholders = references.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT so.id, so.so_number, so.reference, so.status,
              (SELECT pl.status FROM pick_lists pl
                WHERE pl.so_id = so.id ORDER BY pl.id DESC LIMIT 1) AS pick_status
         FROM sales_orders so
        WHERE so.reference IN (${placeholders}) AND so.reference <> ''`
    )
    .all(...references);

  res.json({
    ok: true,
    as_of: new Date().toISOString(),
    orders: rows.map((row) => ({
      reference: row.reference,
      so_number: row.so_number,
      status: row.status,
      pick_status: row.pick_status || null,
    })),
  });
});
```

Reads only, writes nothing, and returns no financial detail — just where each
order has got to.

### How the website uses it

Polled every `INVENTORY_RETRY_MINUTES` for orders that were sent and are not yet
finished:

| Inventory system | Customer sees |
| --- | --- |
| `confirmed` (incl. while picking) | Preparing your order |
| `packed` | Ready for dispatch |
| `shipped` | On the way |
| `delivered` / `closed` | Delivered |
| `void` | Cancelled |

Picking is deliberately not shown separately. A pick list exists only while the
sales order is still `confirmed`, and from the customer's side there is no
difference between an order accepted and an order being walked around a
warehouse — surfacing one would only invite "why has it said picked for two
days". The status changes when something visible happens: it is packed.

Delivered and cancelled orders stop being polled, so the request does not grow
with every order ever placed.
