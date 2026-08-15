import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { peso } from '../../lib/format';
import { PRODUCT_CATEGORY_LABELS, SERVICE_CATEGORY_LABELS } from '../../types';
import type { Product, ProductCategory, Service, ServiceCategory } from '../../types';
import {
  Alert,
  Button,
  SelectField,
  Spinner,
  TextAreaField,
  TextField,
} from '../../components/ui';

/**
 * Add, edit and remove what the website sells.
 *
 * Changes save straight to the database, so they are live for customers as soon
 * as the form closes — there is no publish step and no rebuild.
 */

type Mode = 'products' | 'services';

/** Multi-line textarea in, string array out — one item per line. */
const linesToArray = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const arrayToLines = (items: string[]) => items.join('\n');

/** `Key: value` per line, for the product spec table. */
const linesToSpecs = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of linesToArray(text)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
};

const specsToLines = (specs: Record<string, string>) =>
  Object.entries(specs)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

export default function CatalogEditor({ onError }: { onError: (err: unknown) => void }) {
  const [mode, setMode] = useState<Mode>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | Service | 'new' | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([adminApi.products(), adminApi.services()])
      .then(([p, s]) => {
        setProducts(p.products);
        setServices(s.services);
      })
      .catch(onError)
      .finally(() => setLoading(false));
  }, [onError]);

  useEffect(load, [load]);

  async function remove(id: string) {
    const label = mode === 'products' ? 'product' : 'service';
    if (!confirm(`Delete this ${label}? Customers will no longer see it. This cannot be undone.`)) return;
    try {
      if (mode === 'products') await adminApi.deleteProduct(id);
      else await adminApi.deleteService(id);
      load();
    } catch (err) {
      onError(err);
    }
  }

  if (loading) return <Spinner label="Loading catalog…" />;

  const items = mode === 'products' ? products : services;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {(['products', 'services'] as Mode[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(key);
                setEditing(null);
              }}
              aria-pressed={mode === key}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${
                mode === key ? 'bg-cyan-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {key} ({key === 'products' ? products.length : services.length})
            </button>
          ))}
        </div>

        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" aria-hidden />
          Add {mode === 'products' ? 'product' : 'service'}
        </Button>
      </div>

      {editing && (
        <div className="rounded-2xl border-2 border-cyan-300 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold text-slate-900">
              {editing === 'new' ? `New ${mode === 'products' ? 'product' : 'service'}` : `Editing: ${editing.name}`}
            </h2>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="Close editor"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {mode === 'products' ? (
            <ProductForm
              initial={editing === 'new' ? null : (editing as Product)}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                load();
              }}
              onError={onError}
            />
          ) : (
            <ServiceForm
              initial={editing === 'new' ? null : (editing as Service)}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                load();
              }}
              onError={onError}
            />
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">
          Nothing listed yet. Use “Add” above to create your first entry.
        </p>
      ) : (
        <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          {items.map((item) => {
            const isProduct = 'price' in item;
            return (
              <li key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                <img
                  src={item.image}
                  alt=""
                  loading="lazy"
                  className="h-12 w-12 rounded-lg object-cover bg-slate-100 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">
                    {item.name}
                    {isProduct && (item as Product).sku && (
                      <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">
                        {(item as Product).sku}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isProduct
                      ? PRODUCT_CATEGORY_LABELS[(item as Product).category]
                      : SERVICE_CATEGORY_LABELS[(item as Service).category]}{' '}
                    · {peso(isProduct ? (item as Product).price : (item as Service).basePrice)} per{' '}
                    {item.unit}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(item)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- product form */

function ProductForm({
  initial,
  onCancel,
  onSaved,
  onError,
}: {
  initial: Product | null;
  onCancel: () => void;
  onSaved: () => void;
  onError: (err: unknown) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [category, setCategory] = useState<ProductCategory>(initial?.category ?? 'miscellaneous');
  const [subcategory, setSubcategory] = useState(initial?.subcategory ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(String(initial?.price ?? ''));
  const [unit, setUnit] = useState(initial?.unit ?? 'Unit');
  const [image, setImage] = useState(initial?.image ?? '');
  const [features, setFeatures] = useState(arrayToLines(initial?.features ?? []));
  const [specs, setSpecs] = useState(specsToLines(initial?.specs ?? {}));
  const [isBulkEligible, setIsBulkEligible] = useState(initial?.isBulkEligible ?? false);
  const [minBulkQty, setMinBulkQty] = useState(String(initial?.minBulkQty ?? 1));

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      name,
      sku,
      category,
      subcategory,
      description,
      price: Number(price),
      unit,
      image,
      features: linesToArray(features),
      specs: linesToSpecs(specs),
      isBulkEligible,
      minBulkQty: Number(minBulkQty) || 1,
    };

    try {
      if (initial) await adminApi.updateProduct(initial.id, payload);
      else await adminApi.createProduct(payload);
      onSaved();
    } catch (err) {
      const apiError = err as { message?: string; fields?: Record<string, string>; status?: number };
      if (apiError.status === 401) {
        onError(err);
        return;
      }
      setError(apiError.message ?? 'Could not save.');
      setFieldErrors(apiError.fields ?? {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField
          label="Product name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          required
        />
        <TextField
          label="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          error={fieldErrors.sku}
          placeholder="HDS-LUXE-SAN"
          hint="Must match the inventory system exactly."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as ProductCategory)}
          error={fieldErrors.category}
        >
          {Object.entries(PRODUCT_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Subcategory"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          error={fieldErrors.subcategory}
          placeholder="e.g. Sanitation Chemicals"
        />
      </div>

      <TextAreaField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={fieldErrors.description}
        rows={3}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Price (₱, excluding VAT)"
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={fieldErrors.price}
          required
        />
        <TextField
          label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          error={fieldErrors.unit}
          placeholder="20L Carboy"
        />
        <TextField
          label="Minimum bulk quantity"
          type="number"
          min={1}
          value={minBulkQty}
          onChange={(e) => setMinBulkQty(e.target.value)}
          error={fieldErrors.minBulkQty}
        />
      </div>

      <TextField
        label="Image URL"
        value={image}
        onChange={(e) => setImage(e.target.value)}
        error={fieldErrors.image}
        placeholder="https://…"
        hint="Paste a direct link to a photo. Square or 4:3 works best."
      />

      <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
        <input
          type="checkbox"
          checked={isBulkEligible}
          onChange={(e) => setIsBulkEligible(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
        />
        Eligible for bulk pricing
      </label>

      <TextAreaField
        label="Key features"
        value={features}
        onChange={(e) => setFeatures(e.target.value)}
        rows={4}
        hint="One per line."
      />

      <TextAreaField
        label="Specifications"
        value={specs}
        onChange={(e) => setSpecs(e.target.value)}
        rows={4}
        hint="One per line, formatted as “Label: value”."
      />

      <div className="flex gap-2.5 pt-2">
        <Button type="submit" loading={saving}>
          {initial ? 'Save changes' : 'Create product'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- service form */

function ServiceForm({
  initial,
  onCancel,
  onSaved,
  onError,
}: {
  initial: Service | null;
  onCancel: () => void;
  onSaved: () => void;
  onError: (err: unknown) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<ServiceCategory>(initial?.category ?? 'general_sanitation');
  const [tagline, setTagline] = useState(initial?.tagline ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [basePrice, setBasePrice] = useState(String(initial?.basePrice ?? ''));
  const [unit, setUnit] = useState(initial?.unit ?? 'Per visit');
  const [image, setImage] = useState(initial?.image ?? '');
  const [features, setFeatures] = useState(arrayToLines(initial?.features ?? []));
  const [pros, setPros] = useState(arrayToLines(initial?.institutionalPros ?? []));
  const [idealFor, setIdealFor] = useState(arrayToLines(initial?.idealFor ?? []));
  const [frequencies, setFrequencies] = useState(arrayToLines(initial?.frequencyOptions ?? []));

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      name,
      category,
      tagline,
      description,
      basePrice: Number(basePrice),
      unit,
      image,
      features: linesToArray(features),
      institutionalPros: linesToArray(pros),
      idealFor: linesToArray(idealFor),
      frequencyOptions: linesToArray(frequencies),
    };

    try {
      if (initial) await adminApi.updateService(initial.id, payload);
      else await adminApi.createService(payload);
      onSaved();
    } catch (err) {
      const apiError = err as { message?: string; fields?: Record<string, string>; status?: number };
      if (apiError.status === 401) {
        onError(err);
        return;
      }
      setError(apiError.message ?? 'Could not save.');
      setFieldErrors(apiError.fields ?? {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <TextField
        label="Service name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldErrors.name}
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as ServiceCategory)}
          error={fieldErrors.category}
        >
          {Object.entries(SERVICE_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          error={fieldErrors.tagline}
          placeholder="One line that sums it up"
        />
      </div>

      <TextAreaField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        error={fieldErrors.description}
        rows={3}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Starting price (₱)"
          type="number"
          min={0}
          step="0.01"
          value={basePrice}
          onChange={(e) => setBasePrice(e.target.value)}
          error={fieldErrors.basePrice}
          required
          hint="Used to calculate the down payment."
        />
        <TextField
          label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          error={fieldErrors.unit}
          placeholder="Per sqm / Per visit"
        />
      </div>

      <TextField
        label="Image URL"
        value={image}
        onChange={(e) => setImage(e.target.value)}
        error={fieldErrors.image}
        placeholder="https://…"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextAreaField
          label="What the visit includes"
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          rows={4}
          hint="One per line."
        />
        <TextAreaField
          label="Why institutions choose it"
          value={pros}
          onChange={(e) => setPros(e.target.value)}
          rows={4}
          hint="One per line."
        />
        <TextAreaField
          label="Ideal for"
          value={idealFor}
          onChange={(e) => setIdealFor(e.target.value)}
          rows={3}
          hint="One per line. Shown as tags."
        />
        <TextAreaField
          label="Frequency options"
          value={frequencies}
          onChange={(e) => setFrequencies(e.target.value)}
          rows={3}
          hint="One per line, e.g. Weekly."
        />
      </div>

      <div className="flex gap-2.5 pt-2">
        <Button type="submit" loading={saving}>
          {initial ? 'Save changes' : 'Create service'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
