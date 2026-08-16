import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Product, Service } from '../types';

/**
 * The catalog, loaded once and shared by every page.
 *
 * Products and services live in the database and are edited from the admin
 * panel, so they are fetched rather than bundled — a price change goes live
 * without a redeploy.
 */

interface CatalogContextValue {
  products: Product[];
  services: Service[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  productById: (id: string) => Product | undefined;
  serviceById: (id: string) => Service | undefined;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.catalog();
      setProducts(data.products);
      setServices(data.services);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'We could not load our catalog. Please refresh the page.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<CatalogContextValue>(
    () => ({
      products,
      services,
      loading,
      error,
      reload: () => void load(),
      productById: (id) => products.find((p) => p.id === id),
      serviceById: (id) => services.find((s) => s.id === id),
    }),
    [products, services, loading, error, load],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog must be used inside a CatalogProvider');
  return context;
}
