import crypto from 'node:crypto';
import { env, lalamoveConfigured, transportifyConfigured } from '../env.js';
import { FREE_DELIVERY_THRESHOLD, money } from './pricing.js';
import { geocodeAddress, type GeocodePrecision } from './geocode.js';
import type { DeliveryAddress, DeliveryOption } from '../types.js';

/**
 * Delivery quoting. Every provider returns the same `DeliveryOption` shape so
 * the checkout page can list our own trucks next to Lalamove and Transportify
 * without caring how each rate was obtained.
 *
 * When a courier's API is unreachable or unconfigured we still return an
 * indicative rate with `isLiveQuote: false`, so checkout never dead-ends — the
 * customer is told the final fee is confirmed before dispatch.
 */

/** Straight-line distance in km. Good enough for indicative rates. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Where the delivery is going, and how sure we are.
 *
 * `precision` decides what the coordinates may be used for. An `approximate`
 * result is a city or district centre: good enough to work out roughly how far
 * a van must travel, but not a place to send a rider, because it is not the
 * customer's address. Only `exact` is allowed to reach a courier.
 */
interface ResolvedDestination {
  lat: number;
  lng: number;
  precision: GeocodePrecision;
  km: number;
  /** True when the distance is a guess rather than derived from coordinates. */
  estimated: boolean;
}

/** The typical Metro Manila / Rizal run, used when nothing better is known. */
const ASSUMED_KM = 18;

/**
 * The customer's price for a live courier quotation.
 *
 * The courier's own figure is what we will be billed; this is what we charge.
 * The gap between them is the buffer that absorbs a rate that moves between
 * checkout and dispatch, which otherwise comes straight out of the order.
 */
const withCourierMargin = (courierFee: number) =>
  money(courierFee * (1 + env.courierQuoteMarkupPercent / 100));

/**
 * Whether a resolved location is good enough to hand to a courier.
 *
 * An address that resolved to nothing never is — there is no pin at all, only
 * an assumption, and pricing a real delivery on a guess is how you send a rider
 * to another province.
 *
 * An `approximate` one usually is, and this is a judgement about Philippine
 * addressing rather than about geocoding. A street named in a subdivision
 * commonly resolves to the purok containing it: a few hundred metres out, not
 * the wrong city. The rider receives the address text and the customer's phone
 * number alongside the pin, which is how these deliveries actually complete.
 * Refusing them all would leave the couriers unusable for most real orders.
 *
 * COURIER_REQUIRE_EXACT_PIN tightens it for anyone who would rather book by
 * hand than have a rider arrive at the end of the right street.
 */
function pinGoodEnoughForCourier(destination: ResolvedDestination): boolean {
  if (destination.precision === 'none') return false;
  return env.requireExactPin ? destination.precision === 'exact' : true;
}

async function resolveDestination(address: DeliveryAddress): Promise<ResolvedDestination> {
  const located = await geocodeAddress(address);
  if (located.precision === 'none') {
    return { lat: 0, lng: 0, precision: 'none', km: ASSUMED_KM, estimated: true };
  }
  return {
    lat: located.lat,
    lng: located.lng,
    precision: located.precision,
    km: haversineKm(env.warehouse.lat, env.warehouse.lng, located.lat, located.lng),
    estimated: false,
  };
}

/* ------------------------------------------------------------- in-house fleet */

function inHouseOption(subtotal: number, km: number): DeliveryOption {
  const free = subtotal >= FREE_DELIVERY_THRESHOLD;

  // ₱150 base covers the first 10 km, then ₱18/km.
  const computed = money(150 + Math.max(0, km - 10) * 18);
  const fee = free ? 0 : computed;

  return {
    provider: 'in_house',
    serviceCode: 'HDS_FLEET',
    label: 'HDS Trading delivery',
    description: free
      ? `Free — your order is over ${FREE_DELIVERY_THRESHOLD.toLocaleString('en-PH')} pesos.`
      : 'Delivered by our own team, who can also carry stock to your storeroom.',
    fee,
    etaLabel: '1–2 business days',
    isLiveQuote: true,
  };
}

function pickupOption(): DeliveryOption {
  return {
    provider: 'pickup',
    serviceCode: 'WAREHOUSE_PICKUP',
    label: 'Pick up at our warehouse',
    description: `Collect from ${env.warehouse.address}. We will text you when it is packed.`,
    fee: 0,
    etaLabel: 'Ready within 24 hours',
    isLiveQuote: true,
  };
}

/* ----------------------------------------------------------------- Lalamove */

/**
 * Lalamove signs every request with an HMAC over
 * `<timestamp>\r\n<METHOD>\r\n<path>\r\n\r\n<body>`.
 */
function lalamoveHeaders(method: string, path: string, body: string) {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', env.lalamove.apiSecret)
    .update(`${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`)
    .digest('hex');

  return {
    Authorization: `hmac ${env.lalamove.apiKey}:${timestamp}:${signature}`,
    'Content-Type': 'application/json',
    Market: env.lalamove.market,
  };
}

/** Vehicle types we offer, cheapest first. */
const LALAMOVE_SERVICES = [
  { code: 'MOTORCYCLE', label: 'Lalamove Motorcycle', hint: 'Up to 20 kg — small chemical orders' },
  { code: 'MPV', label: 'Lalamove MPV', hint: 'Up to 300 kg — cases and dispensers' },
  { code: 'TRUCK330', label: 'Lalamove Truck', hint: 'Up to 1,000 kg — drums and machinery' },
] as const;

async function lalamoveQuote(
  address: DeliveryAddress,
  destination: ResolvedDestination,
  serviceCode: string,
): Promise<{ fee: number; quotationId: string } | null> {
  if (!lalamoveConfigured || !pinGoodEnoughForCourier(destination)) return null;

  const path = '/v3/quotations';
  const payload = JSON.stringify({
    data: {
      serviceType: serviceCode,
      language: 'en_PH',
      stops: [
        {
          coordinates: { lat: String(env.warehouse.lat), lng: String(env.warehouse.lng) },
          address: env.warehouse.address,
        },
        {
          coordinates: { lat: String(destination.lat), lng: String(destination.lng) },
          address: formatAddress(address),
        },
      ],
    },
  });

  try {
    const response = await fetch(`${env.lalamove.baseUrl}${path}`, {
      method: 'POST',
      headers: lalamoveHeaders('POST', path, payload),
      body: payload,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.warn('Lalamove quotation failed:', response.status, await response.text());
      return null;
    }
    const body = (await response.json()) as {
      data?: { quotationId?: string; priceBreakdown?: { total?: string } };
    };
    const total = Number(body.data?.priceBreakdown?.total);
    if (!body.data?.quotationId || !Number.isFinite(total)) return null;
    return { fee: money(total), quotationId: body.data.quotationId };
  } catch (error) {
    console.warn('Lalamove quotation unavailable:', (error as Error).message);
    return null;
  }
}

/** Indicative Lalamove pricing used when we cannot reach their API. */
function lalamoveIndicative(serviceCode: string, km: number): number {
  const table: Record<string, { base: number; perKm: number }> = {
    MOTORCYCLE: { base: 60, perKm: 8 },
    MPV: { base: 260, perKm: 22 },
    TRUCK330: { base: 800, perKm: 35 },
  };
  const rate = table[serviceCode] ?? table.MPV;
  return money(rate.base + km * rate.perKm);
}

/* -------------------------------------------------------------- Transportify */

/**
 * Transportify's booking API is issued per partner account. With a key we ask
 * for a live rate; without one we still show the option with an indicative
 * price and confirm the exact fee before dispatch.
 */
async function transportifyQuote(
  destination: ResolvedDestination,
): Promise<{ fee: number; quotationId?: string; live: boolean }> {
  const indicative = money(430 + destination.km * 26);
  if (!transportifyConfigured || !pinGoodEnoughForCourier(destination)) {
    return { fee: indicative, live: false };
  }

  try {
    const response = await fetch(`${env.transportify.baseUrl}/v1/bookings/price`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.transportify.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_type: 'L300_VAN',
        stops: [
          { latitude: env.warehouse.lat, longitude: env.warehouse.lng },
          { latitude: destination.lat, longitude: destination.lng },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { fee: indicative, live: false };
    const body = (await response.json()) as { price?: number; quotation_id?: string };
    if (!Number.isFinite(body.price)) return { fee: indicative, live: false };
    return { fee: money(body.price as number), quotationId: body.quotation_id, live: true };
  } catch (error) {
    console.warn('Transportify quotation unavailable:', (error as Error).message);
    return { fee: indicative, live: false };
  }
}

/* -------------------------------------------------------------------- public */

export function formatAddress(address: DeliveryAddress): string {
  return [
    address.line1,
    address.barangay,
    address.city,
    address.province,
    address.postalCode,
    'Philippines',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Every delivery choice for a given cart and address, cheapest first within
 * each provider. Courier lookups run in parallel and never block the response
 * for more than their individual timeout.
 */
export async function quoteDeliveryOptions(
  subtotal: number,
  address: DeliveryAddress,
): Promise<DeliveryOption[]> {
  // Resolved once and shared: geocoding is a paid, rate-limited call and every
  // option below needs the same answer.
  const destination = await resolveDestination(address);
  const { km, estimated } = destination;

  const lalamoveOptions = await Promise.all(
    LALAMOVE_SERVICES.map(async (service): Promise<DeliveryOption> => {
      const live = await lalamoveQuote(address, destination, service.code);
      return {
        provider: 'lalamove',
        serviceCode: service.code,
        label: service.label,
        description: live
          ? service.hint
          : `${service.hint}. Indicative rate — confirmed before dispatch.`,
        // Marked up only when live. The indicative table already carries its
        // own margin, and adding this on top would charge twice for one risk.
        fee: live ? withCourierMargin(live.fee) : lalamoveIndicative(service.code, km),
        etaLabel: 'Same day, within hours',
        isLiveQuote: Boolean(live) && !estimated,
        quotationId: live?.quotationId,
      };
    }),
  );

  const transportify = await transportifyQuote(destination);

  return [
    inHouseOption(subtotal, km),
    pickupOption(),
    ...lalamoveOptions,
    {
      provider: 'transportify',
      serviceCode: 'L300_VAN',
      label: 'Transportify L300 Van',
      description: transportify.live
        ? 'Bulk deliveries with loading crew available.'
        : 'Bulk deliveries with loading crew. Indicative rate — confirmed before dispatch.',
      fee: transportify.live ? withCourierMargin(transportify.fee) : transportify.fee,
      etaLabel: 'Same day or scheduled',
      isLiveQuote: transportify.live && !estimated,
      quotationId: transportify.quotationId,
    },
  ];
}

/**
 * Re-derives the fee for the option the customer picked, so a tampered checkout
 * request cannot set its own delivery price.
 */
export async function resolveDeliveryOption(
  subtotal: number,
  address: DeliveryAddress,
  provider: string,
  serviceCode: string,
): Promise<DeliveryOption | null> {
  const options = await quoteDeliveryOptions(subtotal, address);
  return (
    options.find((o) => o.provider === provider && o.serviceCode === serviceCode) ?? null
  );
}

export interface LalamoveBooking {
  bookingRef: string;
  trackingUrl: string | null;
  /** What the courier charges now, which is what we actually pay. */
  fee: number;
}

/**
 * Books the courier for an order that is packed and ready.
 *
 * IT RE-QUOTES FIRST, and it must. A Lalamove quotation is valid for minutes,
 * whereas the one captured at checkout may be days old by the time staff press
 * Dispatch — a bank deposit confirmed the next morning, an order held for a
 * delivery date. Booking against that id fails, and it fails at the worst
 * moment: the goods are packed and the customer is waiting.
 *
 * The fresh price is returned rather than silently accepted, because it may
 * differ from what the customer was charged — surge pricing, a longer route
 * than the straight-line estimate — and that difference comes out of the
 * margin on the order. Staff should see it rather than find it on the invoice.
 */
export async function bookLalamoveDelivery(
  address: DeliveryAddress,
  serviceCode: string,
): Promise<{ ok: true; booking: LalamoveBooking } | { ok: false; reason: string }> {
  if (!lalamoveConfigured) {
    return { ok: false, reason: 'Lalamove is not configured on this server.' };
  }

  const destination = await resolveDestination(address);
  if (!pinGoodEnoughForCourier(destination)) {
    return {
      ok: false,
      reason:
        destination.precision === 'none'
          ? 'This address could not be located at all, so there is no pin to send a rider to. ' +
            'Check the address, or book in the Lalamove app where you can place the pin by hand.'
          : 'This address only resolved approximately, and exact pins are required. ' +
            'Book it in the Lalamove app, where you can place the pin by hand.',
    };
  }

  const fresh = await lalamoveQuote(address, destination, serviceCode);
  if (!fresh) {
    return {
      ok: false,
      reason: 'Lalamove would not quote this delivery just now. Try again, or book in their app.',
    };
  }

  const quotationId = fresh.quotationId;
  const path = '/v3/orders';
  const payload = JSON.stringify({
    data: {
      quotationId,
      sender: {
        stopId: '0',
        name: env.warehouse.contactName,
        phone: env.warehouse.contactPhone,
      },
      recipients: [
        {
          stopId: '1',
          name: address.contactName,
          phone: address.phone,
          remarks: address.landmark ?? '',
        },
      ],
      isPODEnabled: true,
    },
  });

  try {
    const response = await fetch(`${env.lalamove.baseUrl}${path}`, {
      method: 'POST',
      headers: lalamoveHeaders('POST', path, payload),
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error('Lalamove booking failed:', response.status, detail);
      return { ok: false, reason: `Lalamove refused the booking (${response.status}).` };
    }
    const body = (await response.json()) as {
      data?: { orderId?: string; shareLink?: string };
    };
    if (!body.data?.orderId) {
      return { ok: false, reason: 'Lalamove accepted the request but returned no booking id.' };
    }
    return {
      ok: true,
      booking: {
        bookingRef: body.data.orderId,
        trackingUrl: body.data.shareLink ?? null,
        fee: fresh.fee,
      },
    };
  } catch (error) {
    console.error('Lalamove booking error:', (error as Error).message);
    return { ok: false, reason: `Could not reach Lalamove: ${(error as Error).message}` };
  }
}
