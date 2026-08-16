# Lalamove and Transportify — going live

Both couriers appear on the checkout page today, priced from our own distance
table and labelled as indicative. This is what turns them into real, bookable
quotes.

---

## The thing that is not obvious

**API keys alone will not do it.**

Lalamove's v3 API takes *coordinates* on every stop, not an address string. The
checkout collects a street, barangay, city and province — no coordinates. So
before this change, `lalamoveQuote` returned `null` on every single call, and
every courier price you have ever seen came from the fallback table. Pasting in
live keys would not have altered one figure.

The order to switch things on is therefore:

1. **Geocoding first** — without it, nothing else matters.
2. Lalamove keys.
3. Transportify, when you have their partner documentation.

---

## 1. Geocoding (do this first)

At [console.cloud.google.com](https://console.cloud.google.com):

1. Create a project.
2. Enable the **Geocoding API** specifically — not "Maps JavaScript API", which
   is a different product and will not answer these requests.
3. Create an API key, then restrict it twice:
   - **API restriction** → Geocoding API only. An unrestricted key that leaks
     can be spent against your billing account on anything Google sells.
   - **Application restriction** → IP addresses → the website VPS's address.
     This call is made server-side, never from a browser, so the key only ever
     has to work from one machine. A key that only functions from your own
     server is close to worthless to anybody who copies it.
4. Enable billing. A card is required even though you are unlikely to be
   charged: Google gives Geocoding a monthly free allowance, and results here
   are cached so each distinct address is looked up at most once. Check the
   current allowance on Google's Maps Platform pricing page rather than trusting
   a number written down here — it has changed before (it used to be a flat $200
   monthly credit; it is now a per-product monthly free tier).
5. **Set a budget alert** while you are in there: Billing → Budgets & alerts →
   create one at a small amount, say $10. That is the real protection, and it
   does not depend on anyone remembering what the free tier is this year.

Then on the website VPS, in `.env`:

```
GOOGLE_MAPS_API_KEY=AIza...
```

Restart, and check it works from the checkout page — enter a real address and
watch whether the delivery prices change when you complete the province field.
They should, because the distance is now measured rather than assumed.

**Results are cached in the database.** The same barangay is looked up once and
never paid for again. Successful lookups are kept for a year, failures for a
week, because an address Google cannot find today may simply be missing from
its data rather than wrong.

### Precision matters more than you would think

Google answers an address it only half-recognises by returning the **centre of
the city**, with no error. Used for a booking, that sends a rider to the middle
of Pasig instead of to your customer, at a price that looks perfectly
reasonable.

So every result is graded:

| Google says | We treat it as | Used for |
| --- | --- | --- |
| `ROOFTOP` | exact | Live quotes **and** bookings |
| `RANGE_INTERPOLATED` | exact | Live quotes **and** bookings |
| `GEOMETRIC_CENTER`, `APPROXIMATE`, or any partial match | approximate | Distance estimate only — never sent to a courier |
| nothing found | none | Falls back to the assumed 18 km |

By default an `approximate` result **is** used for couriers, and that is a
judgement about Philippine addressing rather than about geocoding. A real
example from this shop:

```
typed:     2 Ballecer Extn., South Signal Village, Taguig, Metro Manila, 1633
Google:    Zone 6 Purok 12, Taguig, Metro Manila     (approximate)
```

That pin is inside the right subdivision — a few hundred metres from the door,
not the centre of Taguig. The rider gets the full address text and the
customer's phone number alongside it, which is how these deliveries actually
complete. Refusing every address like that would leave the couriers unusable for
most real orders.

Set `COURIER_REQUIRE_EXACT_PIN=true` if you would rather book by hand than have
a rider arrive at the end of the right street. An address that resolves to
*nothing* is still always refused — there is no pin at all, only an assumption,
and pricing a real delivery on a guess is how a rider ends up in another
province.

### Letting the customer place the pin

A pin the customer drops themselves is exact by definition, which fixes the
above at the source. The checkout address step offers two ways to do it:

- **Use my location** — the browser's own geolocation. Needs no API key and
  works today.
- **Choose on map** — a draggable pin. This needs `GOOGLE_MAPS_BROWSER_KEY`.

That is a **second, separate key**. The geocoding key is locked to this server's
IP address, which a browser can never satisfy. In the same Google Cloud project:
enable the **Maps JavaScript API**, create another key, restrict it to that API,
and under Application restrictions choose *Websites* → `https://hdstradingopc.com/*`.

Leave it blank and the map simply does not appear — and the site's
Content-Security-Policy stays tighter, since Google's origins are only allowed
when the key is set.

Neither is ever required of the customer. Skipping both costs them nothing.

---

## 2. Lalamove

From [partnerportal.lalamove.com](https://partnerportal.lalamove.com), take the
API key and secret, then in `.env`:

```
LALAMOVE_API_KEY=...
LALAMOVE_API_SECRET=...
LALAMOVE_MARKET=PH
LALAMOVE_BASE_URL=https://rest.sandbox.lalamove.com
```

### Vehicle codes are per market

This one is easy to lose an afternoon to. `TRUCK330` is a genuine Lalamove
vehicle — just not one they run in the Philippines — and quoting it returns:

```
422 {"errors":[{"id":"ERR_INVALID_FIELD","message":"value must be one of
\"MOTORCYCLE\", \"MPV\", \"SEDAN\", \"VAN\", \"2000KG_FB\", ...
"detail":"/data/serviceType"}]}
```

Worth reading that error as good news when you meet it: a 422 on a field value
means the HMAC signature was **accepted**, so the key, the secret and the
request signing are all correct.

`LALAMOVE_SERVICE_TYPES` controls what is offered, defaulting to
`MOTORCYCLE,MPV,2000KG_FB`. If Lalamove refuses one, the log names it and
repeats the list their API accepts for your account, so you can copy from that
rather than guess.

A refused vehicle does not break the checkout — that option simply falls back to
its indicative rate while the others quote live.

**Stay on the sandbox URL until you have placed a test booking end to end.** The
production URL books real riders who really arrive. When you are satisfied:

```
LALAMOVE_BASE_URL=https://rest.lalamove.com
```

### The webhook

Lalamove pushes driver progress — assigned, collected, delivered, cancelled — to
a URL you register in the Partner Portal. Without it, an order stays at whatever
status it had when staff pressed Dispatch until the warehouse catches up.

Generate a secret first:

```
openssl rand -hex 16
```

Put it in `.env` as `LALAMOVE_WEBHOOK_TOKEN`, restart, then register this URL in
the Partner Portal under **Webhooks**, with your value in place of the last
segment:

```
https://hdstradingopc.com/api/webhooks/lalamove/<your-token>
```

If the Partner Portal says **"Non-200 status code received"**, it has probed the
URL and not got a 200. Run this on the website VPS to find out which of three
things it is:

```
curl -sS -o /dev/null -w "%{http_code}\n" -X POST \
  https://hdstradingopc.com/api/webhooks/lalamove/YOUR_TOKEN \
  -H 'Content-Type: application/json' -d '{}'
```

| Result | Cause |
| --- | --- |
| `503` | The route is deployed but `LALAMOVE_WEBHOOK_TOKEN` is not loaded — restart the service after editing `.env` |
| `404` | Either the code is not deployed, or the token in the URL is not the one in `.env` — see below |
| `200` | The endpoint is fine; look for nginx or DNS between Lalamove and the server |

**Both 404 causes look identical in the status code, so read the body.** Drop
the `-o /dev/null` and run it again:

| Body | Cause |
| --- | --- |
| `{"error":"No API route matches POST /api/webhooks/lalamove/…"}` | The code is not deployed — pull, build and restart |
| `{"error":"Not found."}` | Deployed, but the token in the URL is not the one in `.env` |

Or ask the server directly, which needs no token:

```
curl -sS https://hdstradingopc.com/api/webhooks/lalamove
```

- Nothing at that path → not deployed.
- `{"deployed":true,...,"tokenConfigured":false}` → deployed, but
  `LALAMOVE_WEBHOOK_TOKEN` is blank or the service was not restarted after the
  `.env` edit.
- `{"deployed":true,...,"tokenConfigured":true}` → both fine, so the token in
  the registered URL is wrong.

The endpoint answers `GET` as well as `POST`, so a portal reachability check
succeeds. The `GET` reports only that something is listening — never anything
about an order.

**The URL is the credential.** Lalamove's v3 webhooks are not signed the way the
payment gateway's are, so there is no body signature to verify. Two things stand
in for one:

- the secret segment, which makes the endpoint unguessable — with the token
  unset the route refuses everything rather than sitting open;
- the handler only ever acts on a booking reference it created itself, so an
  update naming an order we did not book is acknowledged and ignored.

Nothing in that path touches money. The worst a forged request could do, having
first guessed both the URL and a live Lalamove order id, is move one order's
delivery status.

What the customer sees:

| Lalamove | Customer sees |
| --- | --- |
| `ASSIGNING_DRIVER` | Ready for dispatch — nobody has collected it yet |
| `ON_GOING`, `PICKED_UP` | On the way |
| `COMPLETED` | Delivered |
| `CANCELED`, `EXPIRED`, `REJECTED` | Back to ready for dispatch, booking released |

That last row matters: when a driver cancels, the goods are still on your shelf.
The booking is cleared so staff can dispatch again, and it is logged as a
warning rather than leaving the order stranded as "on the way".

Order status is **forward-only**. The warehouse and the courier both report on
the same order and see different halves of the journey, so a late or
out-of-order event cannot drag a delivered order back to "on the way".

### How a booking now works

Staff press **Dispatch** on the order in the staff portal. The server does not
reuse the quotation from checkout — that expires within minutes, while an order
paid by bank deposit might be dispatched the next morning. It re-quotes against
the same vehicle type and books the fresh quotation.

Two consequences worth knowing:

- **The price can move between checkout and dispatch** — surge at rush hour, a
  road route longer than the straight line, a waiting charge. Whatever it has
  become is what you pay, against a fee fixed at checkout. That is what
  `COURIER_QUOTE_MARKUP_PERCENT` is for: live quotations are charged to the
  customer with **15%** on top, and the gap absorbs the movement.

  So the number worth watching is not whether the price changed — it always
  changes a little — but whether the buffer held. Dispatch reports the margin,
  and only a **shortfall** is raised as a warning:

  ```
  Lalamove charged 262 for HDS-ORD-… but the customer paid 230 — short by 32.
  Consider raising COURIER_QUOTE_MARKUP_PERCENT.
  ```

  If that appears often, raise the percentage. If it never appears, you could
  lower it and quote more keenly.
- **An order already booked cannot be booked twice.** Pressing Dispatch again
  returns an error rather than sending a second rider.

If the address only geocodes approximately, Dispatch refuses and tells you to
book in the Lalamove app, where you can place the pin by hand. That is the
correct outcome: better a manual booking than a rider sent to the wrong street.

---

## 3. Transportify

**This one is not finished, and I would rather say so than have you find out.**

Transportify does not publish its booking API — access is issued per partner
account, with documentation that comes with it. The client in
`server/src/lib/delivery.ts` was written from assumption: the endpoint path, the
auth header and the payload shape are all guesses.

So today, with or without a key, Transportify shows an indicative rate and
`isLiveQuote: false`.

When you have partner access, send me their API documentation and it is a small
job to make it real — the surrounding machinery, the option on the checkout
page, the fallback and the pricing all already work. Until then, leave
`TRANSPORTIFY_API_KEY` blank: a key against a guessed endpoint just adds a
failing request to every checkout.

---

## Checking your work

Once geocoding and Lalamove keys are in, place a test order to a real address
and look at the delivery options. A live quote is one where the price is not a
round number from the table below:

Note that a live Lalamove price on the checkout page is the courier's quotation
plus `COURIER_QUOTE_MARKUP_PERCENT`, so it will not match the figure you would
see in the Lalamove app. That is deliberate — the difference is your buffer
against a rate that moves before dispatch.

| Indicative fallback | Base | Per km |
| --- | --- | --- |
| Motorcycle | ₱60 | ₱8 |
| MPV | ₱260 | ₱22 |
| Truck | ₱800 | ₱35 |
| Transportify van | ₱430 | ₱26 |

The checkout also marks each option: an option quoted live loses the
"Indicative rate — confirmed before dispatch" note from its description.

To confirm geocoding specifically, watch the log while quoting a delivery. A
misconfigured key is reported loudly rather than silently degrading:

```
Geocoding rejected (REQUEST_DENIED): ... Check GOOGLE_MAPS_API_KEY and that
billing is enabled on the Google Cloud project.
```

The precision rules have their own test, which stubs Google and needs no key:

```
npm run test:geocode
```

---

## If you never enable any of this

Nothing breaks. Every courier keeps its indicative price, the customer is told
the fee is confirmed before dispatch, and staff book the rider in the courier's
own app. That is a completely workable way to run the shop — this is about
accuracy at checkout, not about whether orders can be delivered.
