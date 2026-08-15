import { env, inventoryConfigured } from '../env.js';
import { products } from '../db.js';
import { call } from './inventory.js';
import { money, newId, VAT_RATE } from './pricing.js';
import type { Product, ProductCategory } from '../types.js';

/**
 * Mirrors the sellable catalogue from the inventory system.
 *
 * The split is deliberate and narrow. The inventory system decides what may be
 * sold, what it costs and how much is left; the website decides how it is
 * described and photographed. A sync therefore writes price, unit, stock and
 * listing, and never touches feature bullets, specifications, images, category
 * or the customer-facing name — a shop's copy is written once and would be
 * destroyed every fifteen minutes otherwise.
 *
 * Items are matched on SKU, case-insensitively: staff type the same identifier
 * into two systems and `HDS-001` and `hds-001` are the same item.
 */

export interface InventoryCatalogItem {
  sku: string;
  name: string;
  unit: string;
  description: string;
  selling_price: number;
  tax_rate: number;
  image: string;
  category: string;
  brand: string;
  tracked: boolean;
  on_hand: number | null;
  available: number | null;
}

export const fetchCatalog = () =>
  call<{ ok: boolean; as_of: string; items: InventoryCatalogItem[] }>('/integration/catalog');

/* ------------------------------------------------------------------ pricing */

/**
 * Converts an inventory price into the VAT-exclusive figure the website stores.
 *
 * The website adds VAT at checkout, so importing a VAT-inclusive price unchanged
 * would charge the customer 12% over the shelf price. Which convention the
 * inventory system uses is a business decision rather than something we can
 * detect, so it is configuration — and the preview below exists so it can be
 * checked against a real product before anything is written.
 */
export function toWebsitePrice(item: InventoryCatalogItem): number {
  if (!env.inventory.pricesIncludeVat) return money(item.selling_price);
  // Prefer the item's own tax rate; fall back to standard VAT if it has none.
  const rate = item.tax_rate > 0 ? item.tax_rate / 100 : VAT_RATE;
  return money(item.selling_price / (1 + rate));
}

/**
 * Best-effort mapping of the inventory system's free-text category onto one of
 * ours. Anything unrecognised lands in `miscellaneous`, where staff can move it
 * — guessing wrong is worse than an honest "other".
 */
export function mapCategory(raw: string): ProductCategory {
  const text = raw.toLowerCase();
  const rules: [RegExp, ProductCategory][] = [
    [/pool|chlorine|water treat/, 'pool_care'],
    [/tissue|paper|towel/, 'tissues_paper_towels'],
    [/dispenser/, 'dispensers'],
    [/laundry|fabric|detergent/, 'laundry_care'],
    [/hygiene|disinfect|sanitiz|sanitis|antibac/, 'hygiene_care'],
    [/kitchen|housekeep|dish/, 'kitchen_housekeeping'],
    [/restaurant|food service|catering/, 'restaurant_supplies'],
    [/car|pet/, 'car_pet_care'],
    [/machine|equipment|vacuum|scrubber|polisher/, 'equipment'],
    [/mop|broom|brush|janitor|tool/, 'janitorial_tools'],
  ];
  for (const [pattern, category] of rules) if (pattern.test(text)) return category;
  return 'miscellaneous';
}

/* -------------------------------------------------------------------- sync */

export interface CatalogChange {
  sku: string;
  name: string;
  action: 'create' | 'update' | 'hide' | 'relist' | 'unchanged';
  /** Only set when the price differs, so a preview shows what money changes. */
  priceFrom?: number;
  priceTo?: number;
  stockFrom?: number | null;
  stockTo?: number | null;
}

export interface CatalogSyncResult {
  ok: boolean;
  dryRun: boolean;
  asOf: string;
  created: number;
  updated: number;
  hidden: number;
  relisted: number;
  unchanged: number;
  changes: CatalogChange[];
  /** Website products with no SKU — invisible to the sync, and unsellable through it. */
  withoutSku: { id: string; name: string }[];
  error?: string;
}

/**
 * Pulls the catalogue and applies it.
 *
 * `dryRun` computes every change and writes nothing, which is what the staff
 * portal's preview uses. Prices are the reason it exists: a wrong VAT setting
 * is a 12% error across the whole shop, and it should be seen before it is
 * charged, not after.
 */
export async function syncCatalog({ dryRun = false } = {}): Promise<CatalogSyncResult> {
  const empty: CatalogSyncResult = {
    ok: false,
    dryRun,
    asOf: new Date().toISOString(),
    created: 0,
    updated: 0,
    hidden: 0,
    relisted: 0,
    unchanged: 0,
    changes: [],
    withoutSku: [],
  };

  if (!inventoryConfigured) {
    return { ...empty, error: 'The inventory system link is not configured.' };
  }

  let remote: Awaited<ReturnType<typeof fetchCatalog>>;
  try {
    remote = await fetchCatalog();
  } catch (error) {
    return { ...empty, error: (error as Error).message };
  }

  const local = products.all();
  // Case-insensitive index, because the two systems are typed into separately.
  const bySku = new Map(local.filter((p) => p.sku).map((p) => [p.sku.toLowerCase(), p]));
  const seen = new Set<string>();

  const result: CatalogSyncResult = { ...empty, ok: true, asOf: remote.as_of };

  for (const item of remote.items) {
    const key = item.sku.trim().toLowerCase();
    if (!key) continue;
    seen.add(key);

    const price = toWebsitePrice(item);
    const available = item.tracked ? (item.available ?? 0) : null;
    const existing = bySku.get(key);

    if (!existing) {
      const product: Product = {
        id: `inv-${newId().slice(0, 8)}`,
        // Everything comes from inventory on creation; from then on the website
        // owns the presentation and only the commercial fields are refreshed.
        sku: item.sku.trim(),
        name: item.name,
        category: mapCategory(item.category || item.brand || item.name),
        subcategory: item.brand || '',
        description: item.description || '',
        price,
        unit: item.unit || 'Unit',
        image: item.image || '',
        features: [],
        specs: {},
        isBulkEligible: false,
        minBulkQty: 1,
        isListed: true,
        stockTracked: item.tracked,
        stockAvailable: available,
      };
      result.changes.push({ sku: item.sku, name: item.name, action: 'create', priceTo: price, stockTo: available });
      result.created += 1;
      if (!dryRun) {
        products.upsert(product);
        products.setInventoryState(product.id, true, item.tracked, available);
      }
      continue;
    }

    const priceChanged = money(existing.price) !== price;
    const stockChanged = existing.stockAvailable !== available || existing.stockTracked !== item.tracked;
    const unitChanged = existing.unit !== (item.unit || existing.unit);
    const wasHidden = !existing.isListed;

    if (!priceChanged && !stockChanged && !unitChanged && !wasHidden) {
      result.unchanged += 1;
      continue;
    }

    result.changes.push({
      sku: item.sku,
      name: existing.name,
      action: wasHidden ? 'relist' : 'update',
      ...(priceChanged ? { priceFrom: existing.price, priceTo: price } : {}),
      ...(stockChanged ? { stockFrom: existing.stockAvailable, stockTo: available } : {}),
    });
    if (wasHidden) result.relisted += 1;
    else result.updated += 1;

    if (!dryRun) {
      products.upsert({
        ...existing,
        // Commercial fields only. Name, description, image, features, specs and
        // category stay as the website has them.
        price,
        unit: item.unit || existing.unit,
        sku: item.sku.trim(),
        isListed: true,
        stockTracked: item.tracked,
        stockAvailable: available,
      });
      products.setInventoryState(existing.id, true, item.tracked, available);
    }
  }

  // Anything the inventory system stopped offering — unticked, deactivated, or
  // its SKU removed — is hidden rather than deleted, so its reviews and its
  // place in past orders survive.
  for (const product of local) {
    if (!product.sku || seen.has(product.sku.toLowerCase())) continue;
    if (!product.isListed) continue;
    result.changes.push({ sku: product.sku, name: product.name, action: 'hide' });
    result.hidden += 1;
    if (!dryRun) products.setInventoryState(product.id, false, product.stockTracked, product.stockAvailable);
  }

  // Surfaced rather than silently ignored: a product with no SKU can never be
  // ordered through the warehouse, and staff have no other way to notice.
  result.withoutSku = local
    .filter((p) => !p.sku?.trim())
    .map((p) => ({ id: p.id, name: p.name }));

  return result;
}
