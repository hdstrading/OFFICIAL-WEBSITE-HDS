/**
 * The API contract. These shapes are mirrored in `client/src/types.ts` — keep the
 * two in step when you change a field.
 */

export type ProductCategory =
  | 'janitorial_tools'
  | 'equipment'
  | 'kitchen_housekeeping'
  | 'tissues_paper_towels'
  | 'dispensers'
  | 'laundry_care'
  | 'hygiene_care'
  | 'pool_care'
  | 'restaurant_supplies'
  | 'car_pet_care'
  | 'miscellaneous';

export type ServiceCategory = 'general_sanitation' | 'pool_maintenance' | 'specialized_hygiene';

export interface Product {
  id: string;
  name: string;
  /**
   * Stock-keeping unit. This is the join to the inventory system — an order
   * line is matched there by SKU, so a product without one cannot be pushed.
   */
  sku: string;
  category: ProductCategory;
  subcategory: string;
  description: string;
  /** Philippine Peso. */
  price: number;
  unit: string;
  image: string;
  features: string[];
  specs: Record<string, string>;
  isBulkEligible: boolean;
  minBulkQty: number;
}

export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  tagline: string;
  description: string;
  basePrice: number;
  unit: string;
  image: string;
  features: string[];
  institutionalPros: string[];
  idealFor: string[];
  frequencyOptions: string[];
}

export interface DiscountCode {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  description: string;
}

export interface QuoteItem {
  productId: string;
  /** Snapshot of the SKU at the time of ordering, for the inventory push. */
  sku: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export type QuoteStatus = 'Received' | 'Reviewing' | 'Quoted' | 'Won' | 'Closed';
export type BookingStatus = 'Confirmed' | 'Pending Callback' | 'Completed' | 'Cancelled';
export type Urgency = 'routine' | 'urgent' | 'immediate';

export interface QuoteRequest {
  id: string;
  reference: string;
  clientName: string;
  institutionName: string;
  email: string;
  phone: string;
  address: string;
  items: QuoteItem[];
  urgency: Urgency;
  status: QuoteStatus;
  instructions?: string;
  discountCode?: string | null;
  subtotal: number;
  discountAmount: number;
  vat: number;
  total: number;
  createdAt: string;
}

export interface Booking {
  id: string;
  reference: string;
  clientName: string;
  institutionName: string;
  email: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  preferredDate: string;
  preferredTimeSlot: string;
  notes?: string;
  areaSize?: string;
  bookingStatus: BookingStatus;
  estimatedPrice: number;
  createdAt: string;
  /** Down payment taken to hold the slot. */
  depositAmount: number;
  depositStatus: PaymentStatus;
  depositReference?: string | null;
  depositUrl?: string | null;
  depositPaidAt?: string | null;
  /** Still owed on completion of the visit. */
  balanceDue: number;
}

/* ------------------------------------------------------- booking availability */

export interface TimeSlotAvailability {
  slot: string;
  booked: number;
  capacity: number;
  available: boolean;
}

export interface DayAvailability {
  /** YYYY-MM-DD */
  date: string;
  /** True when at least one slot is still open. */
  available: boolean;
  status: 'open' | 'limited' | 'full' | 'closed' | 'past';
  /** Why the day cannot be booked, shown as a tooltip. */
  reason?: string;
  slots: TimeSlotAvailability[];
}

/* ------------------------------------------------------------------- reviews */

export type ReviewSubject = 'product' | 'service';

export interface Review {
  id: string;
  subjectType: ReviewSubject;
  subjectId: string;
  subjectName: string;
  authorName: string;
  institutionName?: string;
  role?: string;
  rating: number;
  comment: string;
  /** Set when the reviewer supplied a matching order or booking reference. */
  verified: boolean;
  published: boolean;
  createdAt: string;
}

export interface RatingSummary {
  average: number;
  count: number;
  /** Number of reviews at each star level, index 0 = 1 star. */
  distribution: [number, number, number, number, number];
}

/* --------------------------------------------------------------- e-commerce */

/**
 * How the customer pays. `card`, `gcash`, `maya` and `online_banking` are
 * settled online through the payment gateway; `bank_transfer` and `cod` are
 * settled manually and are marked paid by staff in the admin panel.
 */
export type PaymentMethod =
  | 'card'
  | 'gcash'
  | 'maya'
  | 'online_banking'
  | 'bank_transfer'
  | 'cod';

export type PaymentStatus = 'unpaid' | 'awaiting_payment' | 'paid' | 'failed' | 'refunded';

export type OrderStatus =
  | 'pending_payment'
  | 'processing'
  | 'ready_for_dispatch'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

/** Who carries the goods to the customer. */
export type DeliveryProvider = 'in_house' | 'lalamove' | 'transportify' | 'pickup';

export interface DeliveryAddress {
  contactName: string;
  phone: string;
  line1: string;
  barangay?: string;
  city: string;
  province: string;
  postalCode?: string;
  landmark?: string;
  /** Set when the customer picks a point on the map; required for courier quotes. */
  lat?: number;
  lng?: number;
}

export interface DeliveryOption {
  provider: DeliveryProvider;
  /** Provider-specific vehicle/service tier, e.g. Lalamove's `MPV`. */
  serviceCode: string;
  label: string;
  description: string;
  fee: number;
  etaLabel: string;
  /** False when we could only show an indicative rate rather than a live quote. */
  isLiveQuote: boolean;
  /** Opaque handle returned by the courier, needed to place the booking later. */
  quotationId?: string;
}

export interface OrderItem {
  productId: string;
  /** Snapshot of the SKU at the time of ordering, for the inventory push. */
  sku: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  reference: string;
  customerName: string;
  institutionName?: string;
  email: string;
  phone: string;
  items: OrderItem[];
  address: DeliveryAddress;
  delivery: DeliveryOption;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  /** Gateway checkout session id, used to reconcile webhooks. */
  paymentReference?: string | null;
  /** URL the customer is sent to in order to pay. */
  paymentUrl?: string | null;
  courierBookingRef?: string | null;
  courierTrackingUrl?: string | null;
  notes?: string;
  discountCode?: string | null;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  vat: number;
  total: number;
  createdAt: string;
  paidAt?: string | null;

  /** Whether this order has reached the inventory system as a sales order. */
  inventoryStatus: InventoryPushStatus;
  /** The sales order number the inventory system assigned, once accepted. */
  inventoryRef?: string | null;
  /** Why the last attempt failed, shown to staff so they can act on it. */
  inventoryError?: string | null;
  inventoryAttempts: number;
}

/**
 * `skipped` covers orders placed while the link was switched off or
 * unconfigured — distinct from `failed`, which means we tried and could not.
 */
export type InventoryPushStatus = 'pending' | 'sent' | 'failed' | 'skipped';
