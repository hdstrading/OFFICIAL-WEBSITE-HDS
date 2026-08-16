import type {
  AvailabilityResponse,
  Booking,
  DeliveryAddress,
  DeliveryOption,
  DiscountCode,
  Order,
  PaymentMethod,
  PaymentMethodOption,
  Product,
  QuoteRequest,
  Review,
  Service,
} from '../types';

/** Result of a catalog sync, or of previewing one. */
export interface CatalogSyncResult {
  ok: boolean;
  dryRun: boolean;
  asOf: string;
  created: number;
  updated: number;
  hidden: number;
  relisted: number;
  unchanged: number;
  changes: {
    sku: string;
    name: string;
    action: 'create' | 'update' | 'hide' | 'relist' | 'unchanged';
    priceFrom?: number;
    priceTo?: number;
    stockFrom?: number | null;
    stockTo?: number | null;
  }[];
  withoutSku: { id: string; name: string }[];
  excluded: { sku: string; name: string }[];
  error?: string;
}

/**
 * Every call to the backend goes through here.
 *
 * Where the API lives depends on how the site is deployed:
 *
 *  - Single server (default): the API is served from the same origin as the
 *    site, so `/api` is all that is needed. In development Vite proxies `/api`
 *    to the Express server, so the same path works there too.
 *
 *  - Split hosting: the site is static on the IONOS webspace and the API runs
 *    on a VPS at its own subdomain. Set `VITE_API_BASE_URL` at build time to
 *    e.g. `https://api.hdstradingopc.com` and every call goes there instead.
 *
 * The admin session cookie survives the split because the API subdomain and the
 * website share a registrable domain — they are cross-origin but same-site, so
 * the cookie is still sent and is not affected by third-party cookie blocking.
 */
const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

/** Trailing slashes would produce `//api/...` once we append a path. */
const BASE = configuredBase ? `${configuredBase.replace(/\/+$/, '')}/api` : '/api';

/**
 * A failed request that carries per-field messages, so a form can show the
 * problem next to the input that caused it instead of as one banner.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
    /**
     * Set when the server refused an action that the operator may still override
     * deliberately — cancelling an order the warehouse has already shipped. The
     * caller offers the override; it is never applied automatically.
     */
    readonly needsForce = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      // Admin routes authenticate with a session cookie.
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    // Network-level failure: no response at all.
    throw new ApiError(
      'We could not reach our servers. Please check your connection and try again.',
      0,
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  if (!response.ok) {
    const payload = body as {
      error?: string;
      fields?: Record<string, string>;
      needsForce?: boolean;
    };
    throw new ApiError(
      payload.error ?? 'Something went wrong. Please try again.',
      response.status,
      payload.fields ?? {},
      Boolean(payload.needsForce),
    );
  }

  return body as T;
}

const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(data) });

const put = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(data) });

const patch = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(data) });

const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

/* -------------------------------------------------------------------- public */

export const api = {
  catalog: () => request<{ products: Product[]; services: Service[] }>('/catalog'),

  product: (id: string) =>
    request<{ product: Product; reviews: Review[]; rating: Product['rating'] }>(
      `/products/${encodeURIComponent(id)}`,
    ),

  service: (id: string) =>
    request<{ service: Service; reviews: Review[]; rating: Service['rating'] }>(
      `/services/${encodeURIComponent(id)}`,
    ),

  siteInfo: () =>
    request<{
      siteUrl: string;
      freeDeliveryThreshold: number;
      depositPercent: number;
      paymentsLive: boolean;
      timeSlots: string[];
      counts: { products: number; services: number; reviews: number };
    }>('/site-info'),

  promotions: () => request<{ promotions: DiscountCode[] }>('/promotions'),

  paymentMethods: () =>
    request<{ methods: PaymentMethodOption[]; gatewayLive: boolean }>('/payment-methods'),

  validateDiscount: (code: string, items: { productId: string; quantity: number }[]) =>
    post<{ valid: boolean; code: string; label: string | null; discountAmount: number }>(
      '/discount/validate',
      { code, items },
    ),

  deliveryQuote: (items: { productId: string; quantity: number }[], address: DeliveryAddress) =>
    post<{ options: DeliveryOption[]; subtotal: number }>('/delivery/quote', { items, address }),

  placeOrder: (payload: {
    customerName: string;
    institutionName?: string;
    email: string;
    phone: string;
    items: { productId: string; quantity: number }[];
    address: DeliveryAddress;
    deliveryProvider: string;
    deliveryServiceCode: string;
    paymentMethod: PaymentMethod;
    discountCode?: string;
    notes?: string;
  }) => post<{ order: Order }>('/orders', payload),

  order: (reference: string) =>
    request<{ order: Order }>(`/orders/${encodeURIComponent(reference)}`),

  requestQuote: (payload: {
    clientName: string;
    institutionName: string;
    email: string;
    phone: string;
    address: string;
    urgency: string;
    instructions?: string;
    discountCode?: string;
    items: { productId: string; quantity: number }[];
  }) => post<{ quote: QuoteRequest }>('/quotes', payload),

  quote: (reference: string) =>
    request<{ quote: QuoteRequest }>(`/quotes/${encodeURIComponent(reference)}`),

  availability: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return request<AvailabilityResponse>(`/availability${qs ? `?${qs}` : ''}`);
  },

  createBooking: (payload: {
    clientName: string;
    institutionName: string;
    email: string;
    phone: string;
    serviceId: string;
    preferredDate: string;
    preferredTimeSlot: string;
    notes?: string;
    areaSize?: string;
  }) => post<{ booking: Booking }>('/bookings', payload),

  booking: (reference: string) =>
    request<{ booking: Booking }>(`/bookings/${encodeURIComponent(reference)}`),

  bookingDepositLink: (reference: string) =>
    post<{ paymentUrl: string }>(`/bookings/${encodeURIComponent(reference)}/deposit`, {}),

  reviews: (type?: string, id?: string) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (id) params.set('id', id);
    const qs = params.toString();
    return request<{ reviews: Review[]; summaries: Record<string, Product['rating']> }>(
      `/reviews${qs ? `?${qs}` : ''}`,
    );
  },

  submitReview: (payload: {
    subjectType: 'product' | 'service';
    subjectId: string;
    authorName: string;
    institutionName?: string;
    role?: string;
    rating: number;
    comment: string;
    reference?: string;
  }) => post<{ review: Review; message: string }>('/reviews', payload),
};

/* --------------------------------------------------------------------- admin */

export const adminApi = {
  me: () => request<{ email: string }>('/admin/me'),
  login: (email: string, password: string) =>
    post<{ email: string; expiresAt: number }>('/admin/login', { email, password }),
  logout: () => post<{ ok: true }>('/admin/logout', {}),

  stats: () =>
    request<{
      products: number;
      services: number;
      orders: number;
      paidOrders: number;
      pendingOrders: number;
      revenue: number;
      quotes: number;
      bookings: number;
      upcomingBookings: number;
      depositsOutstanding: number;
      reviews: number;
      pendingReviews: number;
      inventory: { pending: number; failed: number; sent: number; voidsPending: number };
    }>('/admin/stats'),

  products: () => request<{ products: Product[] }>('/admin/products'),
  createProduct: (data: unknown) => post<{ product: Product }>('/admin/products', data),
  updateProduct: (id: string, data: unknown) =>
    put<{ product: Product }>(`/admin/products/${encodeURIComponent(id)}`, data),
  deleteProduct: (id: string) => del<{ ok: true }>(`/admin/products/${encodeURIComponent(id)}`),

  services: () => request<{ services: Service[] }>('/admin/services'),
  createService: (data: unknown) => post<{ service: Service }>('/admin/services', data),
  updateService: (id: string, data: unknown) =>
    put<{ service: Service }>(`/admin/services/${encodeURIComponent(id)}`, data),
  deleteService: (id: string) => del<{ ok: true }>(`/admin/services/${encodeURIComponent(id)}`),

  discounts: () => request<{ discounts: DiscountCode[] }>('/admin/discounts'),
  createDiscount: (data: unknown) => post<{ discount: DiscountCode }>('/admin/discounts', data),
  deleteDiscount: (id: string) => del<{ ok: true }>(`/admin/discounts/${encodeURIComponent(id)}`),

  orders: () => request<{ orders: Order[] }>('/admin/orders'),
  updateOrderStatus: (
    id: string,
    data: { orderStatus?: string; paymentStatus?: string; force?: boolean },
  ) =>
    patch<{ order: Order }>(`/admin/orders/${encodeURIComponent(id)}/status`, data),
  dispatchOrder: (id: string) =>
    post<{ order: Order }>(`/admin/orders/${encodeURIComponent(id)}/dispatch`, {}),

  quotes: () => request<{ quotes: QuoteRequest[] }>('/admin/quotes'),
  updateQuoteStatus: (id: string, status: string) =>
    patch<{ ok: true }>(`/admin/quotes/${encodeURIComponent(id)}/status`, { status }),

  bookings: () => request<{ bookings: Booking[] }>('/admin/bookings'),
  updateBookingStatus: (id: string, status: string) =>
    patch<{ booking: Booking }>(`/admin/bookings/${encodeURIComponent(id)}/status`, { status }),
  markDepositPaid: (id: string) =>
    post<{ booking: Booking }>(`/admin/bookings/${encodeURIComponent(id)}/deposit-paid`, {}),

  blockedDates: () => request<{ blockedDates: { date: string; reason: string }[] }>('/admin/blocked-dates'),
  blockDate: (date: string, reason: string) =>
    post<{ ok: true }>('/admin/blocked-dates', { date, reason }),
  unblockDate: (date: string) => del<{ ok: true }>(`/admin/blocked-dates/${date}`),

  reviews: () => request<{ reviews: Review[] }>('/admin/reviews'),
  setReviewPublished: (id: string, published: boolean) =>
    patch<{ ok: true }>(`/admin/reviews/${encodeURIComponent(id)}`, { published }),
  deleteReview: (id: string) => del<{ ok: true }>(`/admin/reviews/${encodeURIComponent(id)}`),

  inventoryBacklog: () =>
    request<{
      configured: boolean;
      counts: { pending: number; failed: number; sent: number; voidsPending: number };
      orders: Order[];
    }>('/admin/inventory/backlog'),
  inventoryPing: () =>
    request<{ ok: boolean; system: string; warehouse_configured: boolean; time: string }>(
      '/admin/inventory/ping',
    ),
  retryInventoryPush: (id: string) =>
    post<{ order: Order }>(`/admin/inventory/orders/${encodeURIComponent(id)}/retry`, {}),
  drainInventoryQueue: () =>
    post<{ counts: { pending: number; failed: number; sent: number; voidsPending: number }; orders: Order[] }>(
      '/admin/inventory/drain',
      {},
    ),

  previewCatalogSync: () => request<CatalogSyncResult>('/admin/inventory/catalog/preview'),
  applyCatalogSync: () => post<CatalogSyncResult>('/admin/inventory/catalog/sync', {}),

  integrations: () =>
    request<{
      adminPath: string;
      siteUrl: string;
      depositPercent: number;
      slotCapacity: number;
      integrations: Record<string, { name?: string; configured: boolean; mode?: string; webhook?: boolean }>;
    }>('/admin/integrations'),

  exportUrl: (kind: 'orders' | 'quotes' | 'bookings') => `${BASE}/admin/export/${kind}.csv`,
};
