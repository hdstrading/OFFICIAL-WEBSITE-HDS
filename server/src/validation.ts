import { z } from 'zod';

/**
 * Every value that reaches the database goes through one of these first. Error
 * messages are written to be shown directly to the person filling in the form.
 */

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .min(min, `${label} looks too short — please enter at least ${min} characters.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const email = z
  .string({ required_error: 'Email address is required.' })
  .trim()
  .toLowerCase()
  .email('Please enter a valid email address.')
  .max(254);

/** Philippine mobile/landline formats, punctuation optional. */
const phone = z
  .string({ required_error: 'Contact number is required.' })
  .trim()
  .min(7, 'Please enter a valid contact number.')
  .max(32)
  .refine((v) => (v.match(/\d/g) ?? []).length >= 7, {
    message: 'Please enter a valid contact number.',
  });

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const quoteInputSchema = z.object({
  clientName: trimmed(2, 120, 'Your name'),
  institutionName: trimmed(2, 160, 'Company or institution name'),
  email,
  phone,
  address: trimmed(5, 400, 'Delivery address'),
  urgency: z.enum(['routine', 'urgent', 'immediate']).default('routine'),
  instructions: optionalText(2000),
  discountCode: optionalText(40),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.coerce
          .number()
          .int('Quantity must be a whole number.')
          .min(1, 'Quantity must be at least 1.')
          .max(10_000, 'For orders above 10,000 units please call our sales desk.'),
      }),
    )
    .min(1, 'Please add at least one item to your list before requesting a quote.')
    .max(100, 'Please split orders of more than 100 different items across separate requests.'),
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;

/** Accepts YYYY-MM-DD and rejects dates in the past. */
const bookingDate = z
  .string({ required_error: 'Please choose a preferred date.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please choose a valid date.')
  .refine(
    (value) => {
      const chosen = new Date(`${value}T00:00:00`);
      if (Number.isNaN(chosen.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return chosen >= today;
    },
    { message: 'Please choose today or a later date.' },
  );

export const bookingInputSchema = z.object({
  clientName: trimmed(2, 120, 'Your name'),
  institutionName: trimmed(2, 160, 'Company or institution name'),
  email,
  phone,
  serviceId: z.string({ required_error: 'Please choose a service.' }).trim().min(1),
  preferredDate: bookingDate,
  preferredTimeSlot: trimmed(2, 60, 'Preferred time'),
  notes: optionalText(2000),
  areaSize: optionalText(120),
});

export type BookingInput = z.infer<typeof bookingInputSchema>;

const cartItems = z
  .array(
    z.object({
      productId: z.string().trim().min(1),
      quantity: z.coerce
        .number()
        .int('Quantity must be a whole number.')
        .min(1, 'Quantity must be at least 1.')
        .max(10_000, 'For orders above 10,000 units please call our sales desk.'),
    }),
  )
  .min(1, 'Your cart is empty. Add an item before checking out.')
  .max(100, 'Please split orders of more than 100 different items across separate requests.');

export const deliveryAddressSchema = z.object({
  contactName: trimmed(2, 120, 'Contact name'),
  phone,
  line1: trimmed(5, 240, 'Street address'),
  barangay: optionalText(120),
  city: trimmed(2, 120, 'City or municipality'),
  province: trimmed(2, 120, 'Province'),
  postalCode: optionalText(12),
  landmark: optionalText(240),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const deliveryQuoteSchema = z.object({
  items: cartItems,
  address: deliveryAddressSchema,
});

export const checkoutSchema = z.object({
  customerName: trimmed(2, 120, 'Your name'),
  institutionName: optionalText(160),
  email,
  phone,
  items: cartItems,
  address: deliveryAddressSchema,
  deliveryProvider: z.enum(['in_house', 'lalamove', 'transportify', 'pickup'], {
    errorMap: () => ({ message: 'Please choose a delivery option.' }),
  }),
  deliveryServiceCode: z.string().trim().min(1, 'Please choose a delivery option.').max(60),
  paymentMethod: z.enum(['card', 'gcash', 'maya', 'online_banking', 'bank_transfer', 'cod'], {
    errorMap: () => ({ message: 'Please choose how you would like to pay.' }),
  }),
  discountCode: optionalText(40),
  notes: optionalText(2000),
});

export const reviewSchema = z.object({
  subjectType: z.enum(['product', 'service'], {
    errorMap: () => ({ message: 'Please choose a product or a service.' }),
  }),
  subjectId: z.string().trim().min(1, 'Please choose what you are reviewing.').max(80),
  authorName: trimmed(2, 120, 'Your name'),
  institutionName: optionalText(160),
  role: optionalText(120),
  rating: z.coerce
    .number()
    .int()
    .min(1, 'Please give a rating from 1 to 5 stars.')
    .max(5, 'Please give a rating from 1 to 5 stars.'),
  comment: trimmed(10, 2000, 'Your feedback'),
  /** Optional order/booking/quote reference — marks the review as verified. */
  reference: optionalText(40),
});

export const blockDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please choose a valid date.'),
  reason: z.string().trim().max(200).default('Fully booked'),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required.').max(254),
  password: z.string().min(1, 'Password is required.').max(200),
});

const stringArray = z.array(z.string().trim().max(400)).max(30).default([]);

export const productSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: trimmed(2, 200, 'Product name'),
  /**
   * Must match the SKU in the inventory system exactly — it is what an order
   * line is matched on there. Blank is allowed so a product can be listed
   * before it exists in inventory, but such an order cannot be pushed.
   */
  sku: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9._/-]*$/, 'Use letters, numbers, dots, dashes, slashes and underscores only.')
    .default(''),
  category: z.enum([
    'janitorial_tools',
    'equipment',
    'kitchen_housekeeping',
    'tissues_paper_towels',
    'dispensers',
    'laundry_care',
    'hygiene_care',
    'pool_care',
    'restaurant_supplies',
    'car_pet_care',
    'miscellaneous',
  ]),
  subcategory: z.string().trim().max(120).default(''),
  description: z.string().trim().max(4000).default(''),
  price: z.coerce.number().min(0, 'Price cannot be negative.').max(100_000_000),
  unit: z.string().trim().max(80).default('Unit'),
  image: z.string().trim().max(1000).default(''),
  features: stringArray,
  specs: z.record(z.string().trim().max(200)).default({}),
  isBulkEligible: z.coerce.boolean().default(false),
  minBulkQty: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const serviceSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: trimmed(2, 200, 'Service name'),
  category: z.enum(['general_sanitation', 'pool_maintenance', 'specialized_hygiene']),
  tagline: z.string().trim().max(300).default(''),
  description: z.string().trim().max(4000).default(''),
  basePrice: z.coerce.number().min(0, 'Price cannot be negative.').max(100_000_000),
  unit: z.string().trim().max(80).default('Per visit'),
  image: z.string().trim().max(1000).default(''),
  features: stringArray,
  institutionalPros: stringArray,
  idealFor: stringArray,
  frequencyOptions: stringArray,
});

export const discountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Discount code must be at least 3 characters.')
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dashes and underscores only.'),
  type: z.enum(['percentage', 'fixed']),
  value: z.coerce.number().min(0).max(1_000_000),
  description: z.string().trim().max(300).default(''),
});

export const quoteStatusSchema = z.object({
  status: z.enum(['Received', 'Reviewing', 'Quoted', 'Won', 'Closed']),
});

export const bookingStatusSchema = z.object({
  status: z.enum(['Confirmed', 'Pending Callback', 'Completed', 'Cancelled']),
});

/** Flattens a Zod error into `{ field: message }` for inline form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
