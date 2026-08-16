import { env, geocodingConfigured } from '../env.js';
import { geocodes } from '../db.js';
import type { DeliveryAddress } from '../types.js';

/**
 * Turns a typed address into coordinates, because the couriers need them.
 *
 * Lalamove's v3 API takes coordinates on every stop, not an address string.
 * Without them the quote request cannot even be made, so the whole live-pricing
 * path depends on this — a checkout that collects only a street and a city can
 * never get a real courier price, no matter what keys are configured.
 *
 * PRECISION IS NOT A DETAIL. Google will happily answer an address it only
 * half-recognises by returning the centre of the city. That is fine for
 * estimating a distance and dangerous for booking a rider, who would drive to
 * the centre of Pasig rather than to the customer. So a result carries how
 * exact it is, and the caller decides what it may be used for.
 */

export type GeocodePrecision =
  /** A specific building or a point interpolated along a street. Safe to dispatch to. */
  | 'exact'
  /** A district or city centroid. Usable for distance, never for a booking. */
  | 'approximate'
  /** Nothing usable came back. */
  | 'none';

export interface GeocodeResult {
  lat: number;
  lng: number;
  precision: GeocodePrecision;
  /** What the provider thinks the address is, for staff to sanity-check against. */
  formatted: string;
}

/**
 * Google's `location_type`, mapped onto what we are allowed to do with it.
 *
 * ROOFTOP is a building. RANGE_INTERPOLATED is a position estimated between two
 * known points on a street — close enough for a rider. GEOMETRIC_CENTER and
 * APPROXIMATE are the centre of something larger, which is a different place
 * from the customer's door.
 */
const PRECISE_LOCATION_TYPES = new Set(['ROOFTOP', 'RANGE_INTERPOLATED']);

/**
 * The cache key. Case and spacing vary between customers typing the same
 * address, and each variation would otherwise be a separate paid lookup.
 */
function cacheKey(address: DeliveryAddress): string {
  // Each part is normalised before joining, not after. Normalising the joined
  // string leaves a trailing space stranded in front of its separator, so
  // "12 Real St " and "12 Real St" would key differently and be paid for twice.
  return [address.line1, address.barangay, address.city, address.province, address.postalCode]
    .map((part) => String(part ?? '').toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

/** How long a result is trusted. Buildings do not move; a failure might be temporary. */
const HIT_TTL_DAYS = 365;
const MISS_TTL_DAYS = 7;

/**
 * Resolves an address to coordinates, caching the answer.
 *
 * Never throws and never blocks checkout: every failure path returns
 * `precision: 'none'` and the caller falls back to its distance estimate. A
 * geocoding outage should make delivery prices less exact, not stop the shop
 * taking orders.
 */
export async function geocodeAddress(address: DeliveryAddress): Promise<GeocodeResult> {
  // A customer who pinned their own location on a map has told us precisely
  // where they are, which beats anything we could look up.
  if (typeof address.lat === 'number' && typeof address.lng === 'number') {
    return { lat: address.lat, lng: address.lng, precision: 'exact', formatted: '' };
  }

  const key = cacheKey(address);
  if (!key) return { lat: 0, lng: 0, precision: 'none', formatted: '' };

  const cached = geocodes.get(key, HIT_TTL_DAYS, MISS_TTL_DAYS);
  if (cached) return cached;

  if (!geocodingConfigured) return { lat: 0, lng: 0, precision: 'none', formatted: '' };

  const result = await lookup(key);
  geocodes.put(key, result);
  return result;
}

/* --------------------------------------------------------------- reverse */

/** An address broken into the fields the checkout form actually has. */
export interface ReverseGeocodeResult {
  line1: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  /** Google's own one-line rendering, for showing the customer what was found. */
  formatted: string;
}

/**
 * Google returns an address as a list of typed components rather than fields.
 *
 * The mapping onto ours is a Philippine judgement, not a universal one. A
 * barangay is normally `sublocality_level_1`, occasionally only `neighborhood`.
 * A Metro Manila city arrives as `locality` with `administrative_area_level_1`
 * holding "Metro Manila"; in the provinces the town is the `locality` and the
 * province the same admin level, which is why both are read the same way.
 */
function partsFrom(components: { long_name?: string; types?: string[] }[]): Omit<ReverseGeocodeResult, 'formatted'> {
  const find = (...types: string[]) =>
    components.find((c) => types.some((t) => c.types?.includes(t)))?.long_name ?? '';

  const streetNumber = find('street_number');
  const route = find('route');

  return {
    line1: [streetNumber, route].filter(Boolean).join(' '),
    barangay: find('sublocality_level_1', 'sublocality', 'neighborhood'),
    city: find('locality', 'administrative_area_level_2'),
    province: find('administrative_area_level_1'),
    postalCode: find('postal_code'),
  };
}

/**
 * Turns a pin back into a written address.
 *
 * Deliberately not cached: unlike a typed address, which repeats across
 * customers, a dropped pin is close to unique, so a cache would grow without
 * ever being hit. The call is bounded by the rate limiter on the route instead.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  if (!geocodingConfigured) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', env.googleMapsApiKey);
  url.searchParams.set('region', 'ph');
  url.searchParams.set('language', 'en');

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(env.geocodeTimeoutMs) });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      status?: string;
      error_message?: string;
      results?: {
        address_components?: { long_name?: string; types?: string[] }[];
        formatted_address?: string;
      }[];
    };

    if (body.status === 'REQUEST_DENIED' || body.status === 'OVER_QUERY_LIMIT') {
      console.error(
        `Reverse geocoding rejected (${body.status}): ${body.error_message ?? 'no detail given'}.`,
      );
      return null;
    }

    // Results run most specific first, so the first one is the street address.
    const best = body.results?.[0];
    if (!best?.address_components) return null;

    // A missing house number is normal — plenty of Philippine streets have none
    // in Google's data — so the rest of the address is still worth returning,
    // and the customer keeps whatever they typed for that field.
    return { ...partsFrom(best.address_components), formatted: best.formatted_address ?? '' };
  } catch (error) {
    console.warn(`Reverse geocoding unavailable: ${(error as Error).message}`);
    return null;
  }
}

async function lookup(query: string): Promise<GeocodeResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', env.googleMapsApiKey);
  // Constrained to the Philippines: an unqualified "San Jose" or "Santa Cruz"
  // exists on several continents, and the wrong one silently produces an
  // enormous delivery quote rather than an error anybody would notice.
  url.searchParams.set('components', 'country:PH');
  url.searchParams.set('region', 'ph');

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(env.geocodeTimeoutMs) });
  } catch (error) {
    console.warn(`Geocoding unavailable: ${(error as Error).message}`);
    return { lat: 0, lng: 0, precision: 'none', formatted: '' };
  }

  if (!response.ok) {
    console.warn(`Geocoding failed: ${response.status} ${response.statusText}`);
    return { lat: 0, lng: 0, precision: 'none', formatted: '' };
  }

  const body = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: {
      geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
      formatted_address?: string;
      partial_match?: boolean;
    }[];
  };

  // These two are configuration problems, not address problems, and they are
  // silent otherwise — every quote simply falls back to an estimate and nobody
  // is told the API key is wrong or the billing account is suspended.
  if (body.status === 'REQUEST_DENIED' || body.status === 'OVER_QUERY_LIMIT') {
    console.error(
      `Geocoding rejected (${body.status}): ${body.error_message ?? 'no detail given'}. ` +
        'Check GOOGLE_MAPS_API_KEY and that billing is enabled on the Google Cloud project.',
    );
    return { lat: 0, lng: 0, precision: 'none', formatted: '' };
  }

  const first = body.results?.[0];
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { lat: 0, lng: 0, precision: 'none', formatted: '' };
  }

  // `partial_match` means Google matched something other than what was asked
  // for — usually because a barangay or a unit number was not recognised. The
  // coordinates are real but they are not necessarily this address.
  const precise =
    PRECISE_LOCATION_TYPES.has(first?.geometry?.location_type ?? '') && !first?.partial_match;

  return {
    lat,
    lng,
    precision: precise ? 'exact' : 'approximate',
    formatted: first?.formatted_address ?? '',
  };
}
