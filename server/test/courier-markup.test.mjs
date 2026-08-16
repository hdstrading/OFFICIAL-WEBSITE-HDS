/**
 * Confirms the courier margin lands on live quotations only, and at the set rate.
 *
 * The distinction is the whole point: the indicative table already carries its
 * own margin, so marking that up as well would charge the customer twice for
 * one risk. Google and Lalamove are both stubbed, so this needs no keys and no
 * network.
 *
 * Run:  node server/test/courier-markup.test.mjs /tmp/markup-test.db [percent]
 */

process.env.DATABASE_FILE = process.argv[2] ?? '/tmp/hds-markup-test.db';
process.env.ADMIN_PASSWORD='x'; process.env.SESSION_SECRET='y';
process.env.GOOGLE_MAPS_API_KEY='fake';
process.env.LALAMOVE_API_KEY='k'; process.env.LALAMOVE_API_SECRET='s';
process.env.COURIER_QUOTE_MARKUP_PERCENT = process.argv[3] ?? '15';

const COURIER_PRICE = 200;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('maps.googleapis.com')) {
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({
      status: 'OK',
      results: [{ geometry: { location: { lat: 14.58, lng: 121.06 }, location_type: 'ROOFTOP' }, formatted_address: 'Somewhere, Pasig' }],
    })};
  }
  if (u.includes('lalamove') && u.includes('quotations')) {
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({
      data: { quotationId: 'Q1', priceBreakdown: { total: String(COURIER_PRICE) } },
    })};
  }
  return { ok: false, status: 404, statusText: 'NF', text: async () => '', json: async () => ({}) };
};

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { quoteDeliveryOptions } = await import(
  new URL(path.join(HERE, '..', 'dist', 'lib', 'delivery.js'), 'file://').href
);
const address = { contactName:'T', phone:'1', line1:'12 Real St', city:'Pasig', province:'Metro Manila' };
const options = await quoteDeliveryOptions(1000, address);

const pct = Number(process.env.COURIER_QUOTE_MARKUP_PERCENT);
const expected = Math.round(COURIER_PRICE * (1 + pct/100) * 100) / 100;
const moto = options.find(o => o.serviceCode === 'MOTORCYCLE');
const transportify = options.find(o => o.provider === 'transportify');

let pass = 0, total = 0;
const check = (label, ok, detail='') => { total++; if (ok) pass++; console.log(`  ${ok?'ok  ':'FAIL'} ${label}${detail?'  — '+detail:''}`); };

check(`live Lalamove quote of ${COURIER_PRICE} is charged at ${expected} (+${pct}%)`,
  moto?.fee === expected, `got ${moto?.fee}`);
check('it is still marked as a live quote', moto?.isLiveQuote === true);
check('Transportify has no live quote, so it is NOT marked up',
  transportify?.isLiveQuote === false && transportify?.fee !== Math.round(transportify.fee*1.15*100)/100,
  `got ${transportify?.fee}`);
console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
