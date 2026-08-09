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

/**
 * Every call to the backend goes through here.
 *
 * In production the API is served from the same origin as the site, so the base
 * is simply `/api`. In development Vite proxies `/api` to the Express server on
 * port 4000, so the same path works there too.
 */
const BASE = '/api';

/**
 * A failed request that carries per-field messages, so a form can show the
 * problem next to the input that caused it instead of as one banner.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
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
    const payload = body as { error?: string; fields?: Record<string, string> };
    throw new ApiError(
      payload.error ?? 'Something went wrong. Please try again.',
      response.status,
      payload.fields ?? {},
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
  updateOrderStatus: (id: string, data: { orderStatus?: string; paymentStatus?: string }) =>
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
