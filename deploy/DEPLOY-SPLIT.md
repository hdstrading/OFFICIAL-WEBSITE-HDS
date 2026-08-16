# Split hosting: website on IONOS webspace, API on a VPS

This is the alternative to [DEPLOY-IONOS.md](DEPLOY-IONOS.md), which puts
everything on one VPS.

Here the site is split across two hosts under the same domain:

| Address                     | Hosted on          | Serves                          |
| --------------------------- | ------------------ | ------------------------------- |
| `hdstradingopc.com`         | IONOS Web Hosting  | The website (static files)      |
| `api.hdstradingopc.com`     | IONOS VPS          | The API, database and payments  |

**You still need the VPS.** The webspace cannot run the API, so this does not
avoid the VPS — it only moves the static files onto hosting you may already be
paying for. Read [Which setup should I use?](#which-setup-should-i-use) below
before committing to it.

---

## 1. DNS

In **Domains & SSL → hdstradingopc.com → DNS**:

| Type | Host name | Points to                    | Purpose             |
| ---- | --------- | ---------------------------- | ------------------- |
| A    | `@`       | *(IONOS webspace — preset)*  | The website         |
| A    | `www`     | *(IONOS webspace — preset)*  | Redirects to `@`    |
| A    | `api`     | `203.0.113.10`               | Your VPS            |

Leave `@` and `www` pointing at the IONOS webspace — the control panel sets
those for you when the domain is attached to your hosting package. Add only the
`api` record, using your VPS's IPv4 address.

Confirm before continuing:

```bash
dig +short api.hdstradingopc.com    # your VPS IP
dig +short hdstradingopc.com        # the IONOS webspace IP
```

---

## 2. Set up the API on the VPS

Follow [DEPLOY-IONOS.md](DEPLOY-IONOS.md) **steps 2 to 5** (server prep, code,
`.env`, build, systemd). Then make these changes to `.env`:

```bash
SITE_URL=https://hdstradingopc.com
VITE_API_BASE_URL=https://api.hdstradingopc.com
CORS_ORIGINS=https://hdstradingopc.com,https://www.hdstradingopc.com
```

`CORS_ORIGINS` is what allows the website to call the API at all. It must match
your site address exactly — scheme included, no trailing slash. Get this wrong
and every page loads but no data appears.

Restart: `sudo systemctl restart hdstradingopc`

### nginx for the API subdomain

Use the API-only config rather than the full-site one:

Same three-step dance as the main guide: the real config points at certificate
files that do not exist yet, and certbot needs a working nginx before it can
create them. Start HTTP-only, get the certificate, then install the real config.

```bash
# Bootstrap config, with server_name pointed at the API subdomain.
sudo sed 's/hdstradingopc.com www.hdstradingopc.com/api.hdstradingopc.com/' \
  deploy/nginx-bootstrap.conf | sudo tee /etc/nginx/sites-available/hds-api > /dev/null
sudo ln -s /etc/nginx/sites-available/hds-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx

# Certificate for the API subdomain only.
sudo certbot certonly --webroot -w /var/www/certbot -d api.hdstradingopc.com

# Now the real config.
sudo cp deploy/nginx-api-only.conf /etc/nginx/sites-available/hds-api
sudo nginx -t && sudo systemctl reload nginx
```

Check it:

```bash
curl https://api.hdstradingopc.com/api/health
# {"status":"ok","time":"..."}
```

---

## 3. Build the website for the webspace

On your own computer (or the VPS — anywhere with the code). If you are cloning
fresh, remember the branch, as in step 3 of the main guide:

```bash
git clone -b claude/hds-trading-opc-enhance-zd46mv \
  https://github.com/hdstrading/OFFICIAL-WEBSITE-HDS.git
cd OFFICIAL-WEBSITE-HDS

export SITE_URL=https://hdstradingopc.com
export VITE_API_BASE_URL=https://api.hdstradingopc.com

npm ci
npm run build:webspace
```

`build:webspace` does three things beyond a normal build: it points the site at
your API subdomain, generates `robots.txt` and `sitemap.xml` (which the Node
server would normally produce on the fly), and copies in the `.htaccess`.

The result is in `client/dist/`.

---

## 4. Upload it

Get your SFTP details from **Hosting → SFTP & SSH** in the IONOS panel, then
upload **the contents of `client/dist/`** — not the folder itself — into the
document root (usually `/` or `/htdocs`).

With `lftp` (`sudo apt install lftp`):

```bash
lftp -u YOUR_SFTP_USER sftp://home123456789.1and1-data.host <<'EOF'
mirror --reverse --delete --verbose client/dist/ /
bye
EOF
```

Or drag the contents across in FileZilla.

**Two things people get wrong here:**

1. **`.htaccess` must arrive.** Its leading dot makes it hidden — switch on
   "show hidden files" in your FTP client and confirm it is there. Without it
   every deep link (`/products`, `/book`, a customer's order page) returns 404,
   and so does refreshing any page other than the home page.

2. **Upload the *contents*.** If you end up with `hdstradingopc.com/dist/`,
   nothing will load.

### Before you upload: edit the .htaccess if needed

`deploy/webspace/.htaccess` has your API subdomain written into its Content
Security Policy, and your admin path in the noindex rule. If you changed either
from the defaults, update both lines — the browser blocks API calls that the CSP
does not permit.

---

## 5. Check it works

Open `https://hdstradingopc.com`. Then specifically test:

- **A deep link.** Go straight to `https://hdstradingopc.com/products` and
  refresh. If you get a 404, the `.htaccess` did not upload.
- **Data loading.** Products should appear. If the page renders but is empty,
  open the browser console — a CORS error means `CORS_ORIGINS` is wrong; a CSP
  error means the API subdomain is missing from the `.htaccess`.
- **The staff portal.** Sign in at your secret path, then refresh the page. If
  you are signed out, the session cookie is not surviving; see below.
- **A test order,** end to end with `sk_test_` PayMongo keys.

---

## 6. Point the payment webhook at the API

In the PayMongo dashboard the webhook URL is now on the API subdomain:

```
https://api.hdstradingopc.com/api/webhooks/paymongo
```

---

## Deploying updates

Two places now, instead of one.

**API changed** (anything in `server/`):

```bash
ssh root@your-vps
cd /var/www/hdstradingopc && git pull && npm ci && npm run build
systemctl restart hdstradingopc
```

**Website changed** (anything in `client/`):

```bash
npm ci && npm run build:webspace
# then re-upload client/dist/ over SFTP
```

If you are unsure which changed, do both.

---

## Which setup should I use?

**Single VPS ([DEPLOY-IONOS.md](DEPLOY-IONOS.md)) — recommended.**
One machine, one deploy, one certificate, no CORS. The website and API cannot
disagree about anything because they are the same process. `git pull &&
npm run build && systemctl restart` is the whole update procedure.

**Split hosting (this guide).**
Worth it if you specifically want the static files on IONOS's web servers — for
instance you already pay for the hosting package and want it used, or you want
the marketing pages served independently of the VPS.

Be aware of what it costs you:

- Two deploy steps, and a stale upload means the site and API disagree
- Two TLS certificates to keep renewing
- CORS and CSP to keep in sync — the most common cause of "the site loads but
  nothing appears"
- `robots.txt` and `sitemap.xml` become build-time snapshots, so newly added
  products only reach the sitemap on the next upload
- The VPS is still required, so hosting cost is unchanged

It does **not** buy you resilience: if the VPS is down the pages still load but
nothing works — no catalog, no checkout, no bookings.

If you have no particular reason to split, use the single VPS.

---

## Troubleshooting

**404 on every page except the home page**
`.htaccess` is missing from the document root, or your FTP client hid it. This
is by far the most common problem.

**The site loads but no products appear**
Open the browser console.
- `blocked by CORS policy` → `CORS_ORIGINS` on the VPS does not exactly match
  your site address. Fix it and restart the service.
- `Refused to connect ... Content Security Policy` → the API subdomain is not in
  `connect-src` in `.htaccess`. Fix it and re-upload.
- `ERR_NAME_NOT_RESOLVED` → the `api` DNS record is missing or has not
  propagated yet.

**Staff get signed out on every page refresh**
The session cookie is not coming back. Check that the API is on a *subdomain* of
your site — `api.hdstradingopc.com` works because it shares a registrable domain
with `hdstradingopc.com`. An API on an unrelated domain makes the session a
third-party cookie, which Safari blocks outright. Move it to a subdomain rather
than setting `SESSION_COOKIE_SAMESITE=none`.

**Mixed-content warnings**
Something is being requested over `http://`. Confirm `VITE_API_BASE_URL` starts
with `https://` and rebuild.

**Sitemap is missing new products**
Expected — it is generated at build time here. Re-run `npm run build:webspace`
and re-upload. On the single-VPS setup the sitemap is always current.
