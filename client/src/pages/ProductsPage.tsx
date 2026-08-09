import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PackageSearch, Search, SlidersHorizontal } from 'lucide-react';
import { useCatalog } from '../lib/catalog';
import { Seo, breadcrumbSchema } from '../lib/seo';
import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from '../types';
import { ProductCard } from '../components/CatalogCards';
import { Alert, Button, EmptyState, PageHeader, Section, SelectField, Spinner } from '../components/ui';

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'name';

const SORT_LABELS: Record<SortKey, string> = {
  featured: 'Featured first',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Best rated',
  name: 'Name: A to Z',
};

export default function ProductsPage() {
  const { products, loading, error, reload } = useCatalog();
  // Category and search live in the URL so a filtered view can be shared or
  // bookmarked, and the back button behaves the way people expect.
  const [searchParams, setSearchParams] = useSearchParams();

  const category = searchParams.get('category') ?? 'all';
  const query = searchParams.get('q') ?? '';
  const [sort, setSort] = useState<SortKey>('featured');

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  /** Only categories that actually have stock, so no filter leads to nothing. */
  const categories = useMemo(() => {
    const counts = new Map<ProductCategory, number>();
    for (const product of products) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) =>
      PRODUCT_CATEGORY_LABELS[a[0]].localeCompare(PRODUCT_CATEGORY_LABELS[b[0]]),
    );
  }, [products]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = products.filter((product) => {
      if (category !== 'all' && product.category !== category) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.description.toLowerCase().includes(needle) ||
        product.subcategory.toLowerCase().includes(needle) ||
        PRODUCT_CATEGORY_LABELS[product.category].toLowerCase().includes(needle)
      );
    });

    list = [...list];
    switch (sort) {
      case 'price-asc':
        list.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        list.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        list.sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0));
        break;
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        break;
    }
    return list;
  }, [products, category, query, sort]);

  return (
    <>
      <Seo
        title="Cleaning supplies, equipment & pool chemicals"
        description="Browse hospital-grade disinfectants, janitorial equipment, tissue and paper, dispensers and pool chemicals. Order online with card, GCash, Maya or bank transfer, delivered across Metro Manila and Rizal."
        path="/products"
        structuredData={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Supplies', path: '/products' },
        ])}
      />

      <PageHeader
        eyebrow="Shop"
        title="Supplies, equipment & pool care"
        description="Everything we stock, with live prices. Add what you need to your cart and check out online — or request a formal quotation if your organisation needs one for approval."
      />

      <Section className="py-8">
        {/* Filters */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <div>
              <label htmlFor="product-search" className="block text-sm font-semibold text-slate-800 mb-1.5">
                Search
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  aria-hidden
                />
                <input
                  id="product-search"
                  type="search"
                  value={query}
                  onChange={(e) => updateParam('q', e.target.value)}
                  placeholder="Try “disinfectant”, “chlorine” or “vacuum”"
                  className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-2 focus:outline-cyan-600 hover:border-slate-400 transition-colors"
                />
              </div>
            </div>

            <div className="lg:w-56">
              <SelectField
                label="Category"
                value={category}
                onChange={(e) => updateParam('category', e.target.value)}
              >
                <option value="all">All categories ({products.length})</option>
                {categories.map(([key, count]) => (
                  <option key={key} value={key}>
                    {PRODUCT_CATEGORY_LABELS[key]} ({count})
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="lg:w-52">
              <SelectField label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          {(category !== 'all' || query) && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600" role="status">
                <SlidersHorizontal className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" aria-hidden />
                Showing <strong className="text-slate-900">{visible.length}</strong> of {products.length}{' '}
                items
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSearchParams({}, { replace: true })}>
                Clear filters
              </Button>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="mt-8">
          {loading ? (
            <Spinner label="Loading our catalog…" />
          ) : error ? (
            <Alert tone="error" title="We could not load the catalog">
              {error}{' '}
              <button onClick={reload} className="underline font-semibold">
                Try again
              </button>
            </Alert>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<PackageSearch className="h-12 w-12" />}
              title="Nothing matched your search"
              description="Try a different word, or clear the filters to see everything we stock. If you cannot find an item, our sales desk can source it for you."
              action={
                <Button variant="secondary" onClick={() => setSearchParams({}, { replace: true })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
