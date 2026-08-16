/**
 * Mirrors the API contract in `server/src/types.ts`. Keep the two in step when
 * a field changes.
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

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  janitorial_tools: 'Janitorial tools',
  equipment: 'Machines & equipment',
  kitchen_housekeeping: 'Kitchen & housekeeping',
  tissues_paper_towels: 'Tissue & paper towels',
  dispensers: 'Dispensers',
  laundry_care: 'Laundry care',
  hygiene_care: 'Hygiene & disinfection',
  pool_care: 'Pool care',
  restaurant_supplies: 'Restaurant supplies',
  car_pet_care: 'Car & pet care',
  miscellaneous: 'Other supplies',
};

export type ServiceCategory = 'general_sanitation' | 'pool_maintenance' | 'specialized_hygiene';

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  general_sanitation: 'Deep cleaning & sanitation',
  pool_maintenance: 'Pool care & water treatment',
  specialized_hygiene: 'Specialised hygiene programmes',
};

export interface RatingSummary {
  average: number;
  count: number;
  distribution: [number, number, number, number, number];
}

export interface Product {
  id: string;
  name: string;
  /** Must match the SKU in the inventory system — that is how orders are matched. */
  sku: string;
  category: ProductCategory;
  subcategory: string;
  description: string;
  price: number;
  unit: string;
  image: string;
  features: string[];
  specs: Record<string, string>;
  isBulkEligible: boolean;
  minBulkQty: number;
  /** False once the inventory system stops offering it; hidden, never deleted. */
  isListed: boolean;
  /** False for items the warehouse does not count — always sellable. */
  stockTracked: boolean;
  /** Units left, from the last sync. Null when untracked. */
  stockAvailable: number | null;
  rating?: RatingSummary;
}

/** How stock is described to customers — a level, never a raw count. */
export type StockLevel = 'in_stock' | 'low_stock' | 'out_of_stock' | 'untracked';

/**
 * An exact number goes stale between syncs and invites argument; a level stays
 * true for longer and is what a buyer actually needs to decide.
 */
export function stockLevel(product: Product): StockLevel {
  if (!product.stockTracked || product.stockAvailable === null) return 'untracked';
  if (product.stockAvailable <= 0) return 'out_of_stock';
  if (product.stockAvailable <= 5) return 'low_stock';
  return 'in_stock';
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
  rating?: RatingSummary;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type PaymentMethod = 'card' | 'gcash' | 'maya' | 'online_banking' | 'bank_transfer' | 'cod';
export type PaymentStatus = 'unpaid' | 'awaiting_payment' | 'paid' | 'failed' | 'refunded';
export type OrderStatus =
  | 'pending_payment'
  | 'processing'
  | 'ready_for_dispatch'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';
export type DeliveryProvider = 'in_house' | 'lalamove' | 'transportify' | 'pickup';

export interface PaymentMethodOption {
  id: PaymentMethod;
  label: string;
  description: string;
  instant: boolean;
  available: boolean;
  unavailableReason?: string;
  /** Gateway fee added to the total when this method is chosen, as a percentage. */
  feePercent: number;
}

export interface DeliveryAddress {
  contactName: string;
  phone: string;
  line1: string;
  barangay?: string;
  city: string;
  province: string;
  postalCode?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
}

export interface DeliveryOption {
  provider: DeliveryProvider;
  serviceCode: string;
  label: string;
  description: string;
  fee: number;
  etaLabel: string;
  isLiveQuote: boolean;
  quotationId?: string;
}

export interface OrderItem {
  productId: string;
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
  paymentReference?: string | null;
  paymentUrl?: string | null;
  courierBookingRef?: string | null;
  courierTrackingUrl?: string | null;
  notes?: string;
  discountCode?: string | null;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  vat: number;
  /** The payment gateway's cut, passed on. Zero for bank deposit and COD. */
  processingFee: number;
  total: number;
  createdAt: string;
  paidAt?: string | null;
  inventoryStatus: InventoryPushStatus;
  inventoryRef?: string | null;
  inventoryError?: string | null;
  inventoryAttempts: number;
  inventoryVoidStatus: InventoryVoidStatus;
}

/** Whether an order has reached the inventory system as a sales order. */
export type InventoryPushStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/**
 * Whether a cancellation released the stock the sales order was holding.
 * `refused` means the goods had already gone — a return or credit note is owed.
 */
export type InventoryVoidStatus = 'none' | 'pending' | 'released' | 'refused';

export type BookingStatus = 'Confirmed' | 'Pending Callback' | 'Completed' | 'Cancelled';

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
  depositAmount: number;
  depositStatus: PaymentStatus;
  depositReference?: string | null;
  depositUrl?: string | null;
  depositPaidAt?: string | null;
  balanceDue: number;
}

export type Urgency = 'routine' | 'urgent' | 'immediate';
export type QuoteStatus = 'Received' | 'Reviewing' | 'Quoted' | 'Won' | 'Closed';

export interface QuoteRequest {
  id: string;
  reference: string;
  clientName: string;
  institutionName: string;
  email: string;
  phone: string;
  address: string;
  items: OrderItem[];
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

export interface TimeSlotAvailability {
  slot: string;
  booked: number;
  capacity: number;
  available: boolean;
}

export interface DayAvailability {
  date: string;
  available: boolean;
  status: 'open' | 'limited' | 'full' | 'closed' | 'past';
  reason?: string;
  slots: TimeSlotAvailability[];
}

export interface AvailabilityResponse {
  days: DayAvailability[];
  timeSlots: string[];
  earliestDate: string;
  latestDate: string;
  slotCapacity: number;
}

export interface Review {
  id: string;
  subjectType: 'product' | 'service';
  subjectId: string;
  subjectName: string;
  authorName: string;
  institutionName?: string;
  role?: string;
  rating: number;
  comment: string;
  verified: boolean;
  published: boolean;
  createdAt: string;
}

export interface DiscountCode {
  id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  description: string;
}

/** Shape the server returns when a form fails validation. */
export interface ApiFieldError {
  error: string;
  fields?: Record<string, string>;
}

/* ------------------------------------------------------------- staff accounts */

export type AdminRole = 'super_admin' | 'inventory_manager' | 'website_admin';

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** What each role may reach, in the words staff use for it. */
export const ROLE_LABELS: Record<AdminRole, { name: string; scope: string }> = {
  super_admin: {
    name: 'Super admin',
    scope: 'Everything, including staff accounts and company details.',
  },
  inventory_manager: {
    name: 'Inventory manager',
    scope: 'Products, orders, quotations, discounts and the inventory link.',
  },
  website_admin: {
    name: 'Website administrator',
    scope: 'Services, bookings, the calendar, reviews and published content.',
  },
};

/* ------------------------------------------------------------ company details */

export interface CompanyInfo {
  legalName: string;
  shortName: string;
  tagline: string;
  description: string;
  registration: string;
  office: { street: string; region: string; country: string; full: string };
  hours: { label: string; schema: string };
  email: { primary: string; sales: string[]; corporate: string[] };
  social: { facebook: string; messenger: string };
  hotlines: { branch: string; numbers: string[] }[];
  emergency: { label: string; note: string; numbers: string[] };
  delivery: { freeThreshold: number; note: string };
}

/* -------------------------------------------------------------------- content */

export type PostType = 'announcement' | 'article' | 'video' | 'faq';

export interface Post {
  id: string;
  type: PostType;
  slug: string;
  title: string;
  summary: string;
  body: string;
  videoUrl: string;
  image: string;
  category: string;
  authorName: string;
  published: boolean;
  pinned: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const POST_TYPE_LABELS: Record<PostType, { singular: string; plural: string }> = {
  announcement: { singular: 'Announcement', plural: 'Announcements' },
  article: { singular: 'Article', plural: 'Articles & guides' },
  video: { singular: 'Video', plural: 'Videos' },
  faq: { singular: 'FAQ', plural: 'Frequently asked questions' },
};
