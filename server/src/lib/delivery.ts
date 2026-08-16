import crypto from 'node:crypto';
import { env, lalamoveConfigured, transportifyConfigured } from '../env.js';
import { FREE_DELIVERY_THRESHOLD, money } from './pricing.js';
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
 * Distance from our warehouse to the delivery address. Falls back to a
 * mid-range assumption when the customer has not pinned a map location.
 */
function distanceKm(address: DeliveryAddress): { km: number; estimated: boolean } {
  if (typeof address.lat === 'number' && typeof address.lng === 'number') {
    return {
      km: haversineKm(env.warehouse.lat, env.warehouse.lng, address.lat, address.lng),
      estimated: false,
    };
  }
  // No pin — assume a typical Metro Manila / Rizal run.
  return { km: 18, estimated: true };
}

/* ------------------------------------------------------------- in-house fleet */

function inHouseOption(subtotal: number, address: DeliveryAddress): DeliveryOption {
  const { km } = distanceKm(address);
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
  serviceCode: string,
): Promise<{ fee: number; quotationId: string } | null> {
  if (!lalamoveConfigured || address.lat === undefined || address.lng === undefined) return null;

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
          coordinates: { lat: String(address.lat), lng: String(address.lng) },
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
  address: DeliveryAddress,
  km: number,
): Promise<{ fee: number; quotationId?: string; live: boolean }> {
  const indicative = money(430 + km * 26);
  if (!transportifyConfigured || address.lat === undefined || address.lng === undefined) {
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
          { latitude: address.lat, longitude: address.lng },
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
  const { km, estimated } = distanceKm(address);

  const lalamoveOptions = await Promise.all(
    LALAMOVE_SERVICES.map(async (service): Promise<DeliveryOption> => {
      const live = await lalamoveQuote(address, service.code);
      return {
        provider: 'lalamove',
        serviceCode: service.code,
        label: service.label,
        description: live
          ? service.hint
          : `${service.hint}. Indicative rate — confirmed before dispatch.`,
        fee: live ? live.fee : lalamoveIndicative(service.code, km),
        etaLabel: 'Same day, within hours',
        isLiveQuote: Boolean(live) && !estimated,
        quotationId: live?.quotationId,
      };
    }),
  );

  const transportify = await transportifyQuote(address, km);

  return [
    inHouseOption(subtotal, address),
    pickupOption(),
    ...lalamoveOptions,
    {
      provider: 'transportify',
      serviceCode: 'L300_VAN',
      label: 'Transportify L300 Van',
      description: transportify.live
        ? 'Bulk deliveries with loading crew available.'
        : 'Bulk deliveries with loading crew. Indicative rate — confirmed before dispatch.',
      fee: transportify.fee,
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

/** Places the actual courier booking once an order is paid and packed. */
export async function bookLalamoveDelivery(
  quotationId: string,
  address: DeliveryAddress,
): Promise<{ bookingRef: string; trackingUrl: string | null } | null> {
  if (!lalamoveConfigured) return null;

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
      console.error('Lalamove booking failed:', response.status, await response.text());
      return null;
    }
    const body = (await response.json()) as {
      data?: { orderId?: string; shareLink?: string };
    };
    if (!body.data?.orderId) return null;
    return { bookingRef: body.data.orderId, trackingUrl: body.data.shareLink ?? null };
  } catch (error) {
    console.error('Lalamove booking error:', (error as Error).message);
    return null;
  }
}
