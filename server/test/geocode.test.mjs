/**
 * Checks the rules that decide whether a looked-up address may be sent a rider.
 *
 * The precision gate is the safety-critical part: Google answers an address it
 * only half-recognises with the centre of the city, and dispatching to that
 * means the rider goes to the wrong place with a plausible-looking price. The
 * cache assertion is the cost-critical part — every miss is a paid call.
 *
 * Google is stubbed rather than called, so this needs no key and no network.
 *
 * Run:  node server/test/geocode.test.mjs /tmp/geocode-test.db
 */

process.env.DATABASE_FILE = process.argv[2] ?? '/tmp/hds-geocode-test.db';
process.env.GOOGLE_MAPS_API_KEY = 'fake-key-for-test';
process.env.ADMIN_PASSWORD = 'x'; process.env.SESSION_SECRET = 'y';

let calls = 0;
const reply = (payload) => ({ ok: true, status: 200, statusText: 'OK', json: async () => payload });
globalThis.fetch = async (url) => {
  calls++;
  const q = decodeURIComponent(String(url));
  if (q.includes('rooftop')) return reply({ status: 'OK', results: [{ geometry: { location: { lat: 14.58, lng: 121.06 }, location_type: 'ROOFTOP' }, formatted_address: '12 Real St, Pasig' }] });
  if (q.includes('centroid')) return reply({ status: 'OK', results: [{ geometry: { location: { lat: 14.57, lng: 121.08 }, location_type: 'APPROXIMATE' }, formatted_address: 'Pasig, Metro Manila' }] });
  if (q.includes('partial')) return reply({ status: 'OK', results: [{ geometry: { location: { lat: 14.57, lng: 121.08 }, location_type: 'ROOFTOP' }, partial_match: true, formatted_address: 'Somewhere else' }] });
  if (q.includes('denied')) return reply({ status: 'REQUEST_DENIED', error_message: 'billing not enabled' });
  return reply({ status: 'ZERO_RESULTS', results: [] });
};

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { geocodeAddress } = await import(
  new URL(path.join(HERE, '..', 'dist', 'lib', 'geocode.js'), 'file://').href
);
const at = (line) => ({ contactName:'T', phone:'1', line1: line, city:'Pasig', province:'Metro Manila' });

const cases = [
  ['a rooftop match',            'rooftop street',  'exact'],
  ['a city centroid',            'centroid street', 'approximate'],
  ['a partial match',            'partial street',  'approximate'],
  ['an address Google cannot find','unknown street', 'none'],
  ['a rejected key',             'denied street',   'none'],
];
let pass = 0;
for (const [label, line, want] of cases) {
  const r = await geocodeAddress(at(line));
  const ok = r.precision === want;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(32)} -> ${r.precision}`);
  if (ok) pass++;
}
const before = calls;
await geocodeAddress(at('rooftop street'));
await geocodeAddress(at('  ROOFTOP   STREET  '));
console.log(`  ${calls === before ? 'ok  ' : 'FAIL'} cache: repeats and case/space variants cost 0 extra calls (${calls - before})`);
if (calls === before) pass++;
console.log(`\n${pass}/${cases.length + 1} checks passed`);
process.exit(pass === cases.length + 1 ? 0 : 1);
