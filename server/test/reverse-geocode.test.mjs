/**
 * Checks how Google's typed address components map onto the checkout's fields.
 *
 * The mapping is a Philippine judgement rather than a universal one — a barangay
 * arrives as sublocality or sometimes only as a neighborhood, and Metro Manila
 * puts the city in `locality` with the region above it. Google is stubbed, so
 * this needs no key and no network.
 *
 * Run:  node server/test/reverse-geocode.test.mjs /tmp/reverse-test.db
 */

process.env.DATABASE_FILE = process.argv[2] ?? '/tmp/hds-reverse-test.db';
process.env.ADMIN_PASSWORD = 'x'; process.env.SESSION_SECRET = 'y';
process.env.GOOGLE_MAPS_API_KEY = 'fake-key';

const c = (long_name, ...types) => ({ long_name, types });

const RESPONSES = {
  // A Metro Manila address with everything present.
  // Note the key: JavaScript renders 121.0 as "121", which is what reaches the URL.
  '14.5,121': { status: 'OK', results: [{
    formatted_address: '12 Ballecer Extension, Taguig, 1633 Metro Manila, Philippines',
    address_components: [
      c('12', 'street_number'), c('Ballecer Extension', 'route'),
      c('South Signal Village', 'sublocality_level_1', 'sublocality'),
      c('Taguig', 'locality'), c('Metro Manila', 'administrative_area_level_1'),
      c('1633', 'postal_code'), c('Philippines', 'country'),
    ]}]},
  // No house number, barangay only as a neighborhood — very common here.
  '14.6,121.1': { status: 'OK', results: [{
    formatted_address: 'Dolores, Taytay, Rizal, Philippines',
    address_components: [
      c('Dolores', 'neighborhood'), c('Taytay', 'locality'),
      c('Rizal', 'administrative_area_level_1'), c('Philippines', 'country'),
    ]}]},
  // A pin in the sea.
  '10.0,125.0': { status: 'ZERO_RESULTS', results: [] },
};

globalThis.fetch = async (url) => {
  const latlng = new URL(String(url)).searchParams.get('latlng');
  const payload = RESPONSES[latlng] ?? { status: 'ZERO_RESULTS', results: [] };
  return { ok: true, status: 200, statusText: 'OK', json: async () => payload };
};

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { reverseGeocode } = await import(
  new URL(path.join(HERE, '..', 'dist', 'lib', 'geocode.js'), 'file://').href
);

let pass = 0, total = 0;
const check = (label, ok, detail = '') => { total++; if (ok) pass++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`); };

const full = await reverseGeocode(14.5, 121.0);
check('street number and route become line1', full?.line1 === '12 Ballecer Extension', full?.line1);
check('sublocality becomes the barangay', full?.barangay === 'South Signal Village', full?.barangay);
check('locality becomes the city', full?.city === 'Taguig', full?.city);
check('the region becomes the province', full?.province === 'Metro Manila', full?.province);
check('postal code is picked up', full?.postalCode === '1633', full?.postalCode);

const sparse = await reverseGeocode(14.6, 121.1);
check('a neighborhood also counts as a barangay', sparse?.barangay === 'Dolores', sparse?.barangay);
check('a missing house number is not fatal', sparse?.line1 === '' && sparse?.city === 'Taytay', `line1="${sparse?.line1}" city=${sparse?.city}`);
check('a missing postal code is simply blank', sparse?.postalCode === '');

const nowhere = await reverseGeocode(10.0, 125.0);
check('a pin with no address returns null, not a half-filled form', nowhere === null);

console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
