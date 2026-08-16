# Deploying hdstradingopc.com on IONOS

This site is a Node.js application with its own database. It needs a server that
can **run Node** — an IONOS **VPS** or **Cloud Server**.

> **Important:** IONOS *Web Hosting* (the shared plan for WordPress and PHP)
> cannot run this site. It serves PHP and static files only, so there would be
> no API, no online payments, no bookings and no admin panel. If you are
> currently on a Web Hosting plan, you need to add a VPS. The smallest one
> (VPS S — 1 vCPU, 2 GB RAM) is enough to start.

Everything below is a one-time setup of roughly 30–45 minutes.

---

## 1. Point the domain at your server

In the IONOS control panel, open **Domains & SSL → hdstradingopc.com → DNS**.

Set these two records to your VPS's IPv4 address (shown in **Servers & Cloud**):

| Type | Host name | Points to        | TTL      |
| ---- | --------- | ---------------- | -------- |
| A    | `@`       | `203.0.113.10`   | 1 hour   |
| A    | `www`     | `203.0.113.10`   | 1 hour   |

Replace `203.0.113.10` with your real server IP — find it with
`curl -4 -s ifconfig.me` on the VPS itself.

If the domain is attached to an IONOS hosting package, `@` and `www` will
already point at the shared webspace (something like `74.208.x.x`). **Edit those
records rather than adding new ones**, or the two will conflict. Other
subdomains you have — `crm`, `payroll` and so on — are separate records and are
not affected. Neither is your email: MX records are independent of A records.

DNS changes usually publish within 15–60 minutes. Check against a public
resolver rather than the server's own, which caches the old answer until its
TTL expires:

```bash
dig +short hdstradingopc.com @1.1.1.1
dig +short hdstradingopc.com @8.8.8.8
```

Those are what Let's Encrypt will see, so they are the ones that matter. To
clear the server's local cache as well:

```bash
resolvectl flush-caches
dig +short hdstradingopc.com
```

Do not continue to the TLS step until the public resolvers return your server's
IP. Certbot failures are rate-limited to 5 per hostname per hour, so a few
premature attempts will lock you out for a while.

---

## 2. Prepare the server

SSH in as root using the credentials from the IONOS panel:

```bash
ssh root@203.0.113.10
```

Install Node.js 22, nginx and certbot:

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx git build-essential

node -v    # should print v22.x
```

`build-essential` is needed because the database driver compiles a native
module during install.

Create a dedicated user so the website never runs as root.

`--no-create-home` matters: without it `adduser` creates
`/var/www/hdstradingopc` and puts shell profile files in it, and `git clone`
then refuses to clone into a directory that is not empty. We create the user
now and let the clone in the next step make the directory.

```bash
adduser --system --group --no-create-home --home /var/www/hdstradingopc hds
```

---

## 3. Get the code onto the server

> **Which branch?** Until this work is merged, the site lives on the branch
> `claude/hds-trading-opc-enhance-zd46mv` — `main` still contains only the
> README. The `-b` flag below checks out the right branch as you clone. Once
> the pull request is merged you can drop `-b …` and clone `main` as normal.

```bash
cd /var/www
git clone -b claude/hds-trading-opc-enhance-zd46mv \
  https://github.com/hdstrading/OFFICIAL-WEBSITE-HDS.git hdstradingopc
cd hdstradingopc
```

Make sure the directory can be entered by the service user:

```bash
chmod 755 /var/www/hdstradingopc
```

The code stays owned by `root`. The service reads it as the `hds` user, which
root-owned files already allow, and only ever *writes* to the database
directory — created with the right ownership in step 5. Do not `chown` the
whole checkout to `hds`: it gains nothing, and it makes every later `git pull`
fail with `detected dubious ownership` because you run git as root.

The `chmod` matters because `hds` still has to *traverse into* the directory to
run. If the folder was created by `adduser` it may be mode `0750`, which on a
root-owned directory locks the service out and makes systemd fail with
`status=200/CHDIR`.

Check you have the real thing before continuing — you should see `client`,
`server`, `deploy` and `.env.example`:

```bash
ls -a
```

### If the directory already existed

If you created the user without `--no-create-home`, or the clone failed for any
other reason, `/var/www/hdstradingopc` will exist but hold no code. Do not
delete it — fetch into it instead:

```bash
cd /var/www/hdstradingopc
git init
git remote add origin https://github.com/hdstrading/OFFICIAL-WEBSITE-HDS.git
git fetch origin claude/hds-trading-opc-enhance-zd46mv
git checkout -b claude/hds-trading-opc-enhance-zd46mv \
  origin/claude/hds-trading-opc-enhance-zd46mv
```

If `git remote add` reports that the remote already exists, the clone partly
ran — carry on from the `git fetch` line.

---

## 4. Configure it

```bash
cp .env.example .env
nano .env
```

Fill in at minimum:

- `SITE_URL=https://hdstradingopc.com`
- `ADMIN_PASSWORD` — generate one with `openssl rand -base64 24`
- `SESSION_SECRET` — generate one with `openssl rand -hex 32`
- `ADMIN_PATH` **and** `VITE_ADMIN_PATH` — the same value in both
- `DATABASE_FILE=/var/www/hdstradingopc/server/data/hds.db`

The site runs without the payment, email and courier keys — it simply hides the
features they power. You can add them later and restart.

Lock the file down, since it holds your passwords. It stays owned by root:
systemd reads it as root before dropping to the `hds` user, so the application
itself never needs permission to open it.

```bash
chown root:root .env && chmod 600 .env
```

---

## 5. Build and start

```bash
npm ci
npm run build

# The one directory the service writes to, so this one is owned by hds.
mkdir -p server/data && chown -R hds:hds server/data

cp deploy/hdstradingopc.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hdstradingopc
systemctl status hdstradingopc
```

You should see `active (running)`. Confirm the app is answering:

```bash
curl localhost:4000/api/health
# {"status":"ok","time":"..."}
```

On first start the database is created and filled with the starting catalog.

---

## 6. Put nginx in front and switch on HTTPS

There is a deadlock here worth understanding: the real nginx config points at
certificate files, so nginx refuses to start until they exist — but certbot
needs a working nginx to prove you own the domain. So we start with an
HTTP-only config, confirm it is reachable, get the certificate, then install
the real one.

**First check DNS actually points here.** The certificate request fails
otherwise, and Let's Encrypt rate-limits repeated failures:

```bash
dig +short hdstradingopc.com @1.1.1.1
curl -4 -s ifconfig.me; echo
```

Those two must print the same address. Query `@1.1.1.1` rather than the
server's own resolver, which may still be serving a cached answer — see step 1.
If they differ, go back to step 1 and wait for DNS to publish.

### 6a. HTTP-only, so certbot has something to work with

Every `deploy/…` path below is relative to the checkout, so start there:

```bash
cd /var/www/hdstradingopc

cp deploy/nginx-bootstrap.conf /etc/nginx/sites-available/hdstradingopc
ln -s /etc/nginx/sites-available/hdstradingopc /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/certbot

nginx -t && systemctl restart nginx
```

`restart` rather than `reload`: if an earlier config error stopped nginx,
reloading a stopped service does nothing and you are left with nothing on port
80. `nginx -t` should say `syntax is ok` and `test is successful`.

### 6b. Prove the challenge path is reachable

Certbot failures are rate-limited, so confirm the path works before spending an
attempt:

```bash
ss -tlnp | grep ':80'          # nginx should be listening

mkdir -p /var/www/certbot/.well-known/acme-challenge
echo hello > /var/www/certbot/.well-known/acme-challenge/test
curl http://hdstradingopc.com/.well-known/acme-challenge/test
```

That must print `hello`. If it does not, fix it before continuing — a 404 means
the bootstrap config is not the one loaded, and connection refused means nginx
is not running or port 80 is closed (`ufw allow 80,443/tcp` if the firewall is
on).

```bash
rm /var/www/certbot/.well-known/acme-challenge/test
```

### 6c. Get the certificate

```bash
certbot certonly --webroot -w /var/www/certbot \
  -d hdstradingopc.com -d www.hdstradingopc.com
```

`certonly` obtains the certificate without touching your nginx config, which is
what we want — the config we are about to install already handles TLS.

### 6d. Install the real config

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/hdstradingopc
nginx -t && systemctl reload nginx
```

Certbot has already set up automatic renewal. Confirm it works:

```bash
certbot renew --dry-run
```

Open **https://hdstradingopc.com** — the site should load over HTTPS.

### 6e. Close the server down

The application listens on loopback only, so port 4000 is not reachable from
outside — nginx proxies to it from the same machine. Confirm that:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/api/health   # 200
curl -s -m 5 -o /dev/null -w '%{http_code}\n' http://YOUR_SERVER_IP:4000/api/health
```

The second should fail to connect. If it returns 200, `HOST` is set to
`0.0.0.0` somewhere — fix it in `.env` and restart, because that address serves
your site over plain HTTP with none of nginx's protections.

Then turn the firewall on. **Allow SSH first** — enabling `ufw` without it will
lock you out of your own server, and IONOS VPS access is not trivial to recover:

```bash
ufw allow OpenSSH          # check your port first: ss -tlnp | grep sshd
ufw allow 80,443/tcp
ufw --force enable
ufw status verbose
```

You should see `22/tcp`, `80/tcp` and `443/tcp` allowed and everything else
denied. Reconnect over SSH in a *second* terminal before closing this one, so
you can undo it if something is wrong.

---

## 7. Turn on online payments

This turns on card, GCash, Maya and online bank transfer at checkout. Do the
whole thing in **test mode** first — the last stage switches you to live.

### 7a. Get a PayMongo account

Sign up at [dashboard.paymongo.com](https://dashboard.paymongo.com) and complete
business verification. They ask for your SEC registration and BIR documents, and
approval usually takes a few working days. You can build and test everything
below with test keys while you wait — those are available immediately.

### 7b. Add your test keys

In the dashboard, under **Developers → API Keys**, copy the **test** keys:

```bash
cd /var/www/hdstradingopc
nano .env
```

```bash
PAYMONGO_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
PAYMONGO_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxx
```

### 7c. Create the webhook

The webhook is what tells your server a payment succeeded. Without it customers
can pay and their order stays "unpaid" forever, so this step is not optional.

```bash
node scripts/paymongo-webhook.mjs create
```

It prints a `PAYMONGO_WEBHOOK_SECRET=whsk_…` line. Paste that into `.env`.

**PayMongo shows the signing secret only once.** If you lose it, delete the
webhook and create a new one — `node scripts/paymongo-webhook.mjs list` shows
what exists.

Then restart:

```bash
systemctl restart hdstradingopc
```

### 7d. Place a test order

Open your site, add something to the cart and check out with **Credit or Debit
Card**. On the PayMongo page use their test card:

| Field  | Value                |
| ------ | -------------------- |
| Number | `4343 4343 4343 4345` |
| Expiry | any future date      |
| CVC    | any 3 digits         |

Then check the order page. It must show **Paid**.

If it still says awaiting payment, the webhook is not reaching you. Check in
this order:

```bash
journalctl -u hdstradingopc -n 50 --no-pager | grep -i paymongo
node scripts/paymongo-webhook.mjs list
```

`Rejected PayMongo webhook with an invalid signature` means
`PAYMONGO_WEBHOOK_SECRET` does not match the webhook you created. Nothing in the
log at all means PayMongo could not reach your server — confirm the webhook URL
is your real HTTPS address.

Use a realistic order value when testing. PayMongo enforces a minimum
transaction amount and rejects very small ones.

### 7e. Go live

Once a test payment shows as Paid end to end, swap in the **live** keys from the
dashboard and create the webhook again — live mode has its own keys *and* its own
webhook:

```bash
nano .env                                   # sk_live_… and pk_live_…
node scripts/paymongo-webhook.mjs create    # new secret for live mode
systemctl restart hdstradingopc
```

Confirm with one small real purchase on your own card before announcing it.

---

## 8. Turn on email

Until this is done, **customers get no confirmation and your team gets no
notification of new orders**. Orders are still recorded and visible in the staff
portal, and the emails are written to the log rather than lost — but nobody is
told anything automatically.

Two options. The IONOS mailbox is the better one: it sends from your own domain,
which looks right to customers and is less likely to be filtered as spam.

### Option A — IONOS mailbox (recommended)

Create a mailbox such as `orders@hdstradingopc.com` in the IONOS panel under
**Email**, then:

```bash
SMTP_HOST=smtp.ionos.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=orders@hdstradingopc.com
SMTP_PASS=the-mailbox-password
SMTP_FROM=HDS Trading OPC <orders@hdstradingopc.com>
NOTIFY_EMAIL=hanepditoshop@gmail.com
```

### Option B — Gmail

Gmail needs an [App Password](https://myaccount.google.com/apppasswords), not
your account password:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=hanepditoshop@gmail.com
SMTP_PASS=the-16-character-app-password
SMTP_FROM=HDS Trading OPC <hanepditoshop@gmail.com>
NOTIFY_EMAIL=hanepditoshop@gmail.com
```

**Set `SMTP_FROM` to the same address you authenticate with.** Gmail rewrites
the From header to the signed-in account unless the address is verified under
**Settings → Accounts → Send mail as**, so a mismatch means your carefully
branded sender is replaced anyway. Gmail also caps sending at around 500
messages a day.

### Test it

```bash
node scripts/test-email.mjs
```

That checks the credentials, sends one message, and explains the error if
something is wrong. Once it arrives:

```bash
systemctl restart hdstradingopc
```

Then place a test order and confirm both emails arrive — the customer receipt
and the `[Order]` notification to your team. Check spam on the first one.

---

## 9. Sign in to the staff portal

Go to `https://hdstradingopc.com/<your ADMIN_PATH>` — for example
`https://hdstradingopc.com/adminportal`.

Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. On the first start those two
create the first account, a super admin. After that the environment stops being
the password: passwords live in the database so each person can have their own,
and changing `ADMIN_PASSWORD` later does nothing.

Nothing on the public website links to this page, it is excluded from search
engines, and it is not listed in `robots.txt` (which would advertise it). But it
is not a secret — what guards it is that everybody has their own password,
sign-ins are rate limited per address *and* per account, and ten wrong guesses
lock an account for fifteen minutes.

### Give everybody their own account

**Staff accounts** in the portal, super admin only. There are three kinds of
access:

| Access | What they can reach |
| --- | --- |
| Super admin | Everything, plus staff accounts, company details and integrations |
| Inventory manager | Products, orders, quotations, discounts and the warehouse link |
| Website administrator | Services, bookings, the calendar, reviews and published content |

Give each person their own account and stop sharing one. It is the only way to
know who changed a price, and the only way to remove one person's access
without changing everybody's password.

The last active super admin cannot be demoted, switched off or deleted, and
nobody can delete the account they are signed in with — an installation with no
super admin cannot manage its own accounts.

### If everybody is locked out

Passwords are in the database, so editing `.env` will not help. On the server:

```bash
cd /var/www/hdstradingopc
npm run admin:reset --workspace server -- you@example.com
```

It asks for the new password twice, without echoing it, then resets that
account — or creates it as a super admin if the address is new — and reactivates
it if it had been switched off.

---

## 10. Before you tell anyone the address

The site works at this point, but it is still showing the starter catalog.
These are the things worth doing before real customers arrive.

### Replace the demo catalog

The nine products and three services the database was seeded with are examples,
with stock photography and invented specifications. **Prices are real money
now** — a customer can buy any of them at the listed price.

In the staff portal under **Catalog**, either edit each entry to match what you
actually stock, or delete them and add your own. What matters most:

- **Price** — excluding VAT; the site adds 12% at checkout
- **Unit** — "20L Carboy", "Per sqm", whatever you actually sell by
- **Image** — a direct link to a real photo of the product
- **Starting price on services** — the down payment is calculated from it

### Set up backups

You have real orders in the database now. Losing the VPS means losing every
order, booking, quotation and review. See
[Backing up](#backing-up) below and add the cron job — it takes two minutes.

### Check the booking calendar matches reality

Under **Block dates** in the staff portal, close off holidays and any dates your
crews are already committed. `BOOKING_SLOT_CAPACITY` in `.env` sets how many
crews can be booked per time slot — the default is 2.

### Switch PayMongo to live keys

If you tested with `sk_test_` keys, no real money has moved yet. See
[step 7e](#7e-go-live).

### Submit the site to Google

Once the catalog is real, add the site at
[Google Search Console](https://search.google.com/search-console), verify
ownership, and submit `https://hdstradingopc.com/sitemap.xml`. The sitemap is
generated from your live catalog, so it stays current on its own.

### Optional: courier accounts

Lalamove appears at checkout with indicative rates that your team confirms
before dispatch. Adding API credentials replaces those with live quotes and lets
staff book a rider from the order page. See `deploy/COURIERS.md`.

---

## Everyday operations

### Deploying an update

```bash
cd /var/www/hdstradingopc
git pull
npm ci
npm run build
node scripts/check-env.mjs      # did the update add any settings?
systemctl restart hdstradingopc
```

**`.env` is not updated by `git pull`,** and it must not be — it holds your
passwords and keys, so it is deliberately untracked. An update that introduces a
setting therefore adds it to `.env.example` and not to the file the server
actually reads, and whatever it controls stays switched off with nothing to
indicate why.

`check-env.mjs` lists anything present in the example but missing from yours.
To add them, with the example's defaults filled in:

```bash
node scripts/check-env.mjs --append
nano .env                       # fill in any blanks, which are the secrets
systemctl restart hdstradingopc
```

Your products, orders, bookings and reviews live in the database and are not
touched by a deploy.

### Backing up

**The database file is the business.** It holds every order, booking, quotation
and review. Back it up daily:

```bash
mkdir -p /var/backups/hds
sqlite3 /var/www/hdstradingopc/server/data/hds.db \
  ".backup /var/backups/hds/hds-$(date +%F).db"
```

Add it to cron (`crontab -e`) to run every night at 2am, keeping 30 days:

```
0 2 * * * sqlite3 /var/www/hdstradingopc/server/data/hds.db ".backup /var/backups/hds/hds-$(date +\%F).db" && find /var/backups/hds -name '*.db' -mtime +30 -delete
```

Install `sqlite3` first with `apt install -y sqlite3`. Copy those backups off
the server periodically — a backup that only exists on the same machine will
not survive that machine failing.

### Watching the logs

```bash
journalctl -u hdstradingopc -f          # application
tail -f /var/log/nginx/hdstradingopc.error.log
```

### Changing the admin path

Update **both** `ADMIN_PATH` and `VITE_ADMIN_PATH` in `.env`, then rebuild —
the path is compiled into the browser bundle, so a restart alone is not enough:

```bash
npm run build && systemctl restart hdstradingopc
```

If you serve the static site from the IONOS webspace as well, update the
`noindex` rule in `deploy/webspace/.htaccess` to match the new path.

### Editing contact details, hours and hotlines

**Company details** in the portal, super admin only. Contact numbers, opening
hours, addresses, email desks, social links, the emergency line and the
free-delivery threshold are all edited there and live the moment they are saved
— no deploy, no developer. Clearing a field puts the original value back rather
than leaving a blank space, so the way to remove a line is to replace it.

### Publishing announcements, guides, videos and FAQs

**Content** in the portal, for website administrators and super admins. Posts
stay invisible until the *Published* box is ticked, so something half-written
can be saved and finished tomorrow. Announcements, guides and videos appear at
`/resources`; FAQs appear at `/faq` and are marked up so Google can show them
directly in search results.

---

## Troubleshooting

**`cp: cannot stat 'deploy/…': No such file or directory` during step 6**
Either you are not in the checkout — every `deploy/…` path is relative to
`/var/www/hdstradingopc`, so `cd` there first — or your copy of the repository
predates the file. Run `git pull` and check with `ls deploy/`.

**`nginx: [emerg] cannot load certificate ... fullchain.pem`**
You installed the real config before obtaining the certificate. nginx cannot
start without the certificate file, and certbot cannot create it while nginx is
down. Install `nginx-bootstrap.conf` first and follow step 6 in order.

Watch for this cascading: if the `cp` of the bootstrap config fails, the old
config stays in place, nginx will not start, nothing listens on port 80, and
certbot then reports `Connection refused` — which looks like a firewall or DNS
problem but is not. Check `nginx -t` passes and `ss -tlnp | grep ':80'` shows
nginx before running certbot.

**`certbot` fails with "Timeout during connect" or "unauthorized"**
Let's Encrypt could not fetch the challenge file. Check, in this order:
`dig +short hdstradingopc.com` matches `curl -4 -s ifconfig.me`; port 80 is open
(`ufw allow 80,443/tcp` if the firewall is on); and the bootstrap config is the
one currently loaded. Repeated failures are rate-limited, so fix the cause
before retrying.

**`status=200/CHDIR` and the service sits in `activating (auto-restart)`**
systemd could not enter the `WorkingDirectory` as the `hds` user, so the app
never started. The directory is root-owned but not traversable by others —
usually mode `0750`, left behind by `adduser`:

```bash
chmod 755 /var/www/hdstradingopc
mkdir -p /var/www/hdstradingopc/server/data
chown -R hds:hds /var/www/hdstradingopc/server/data
systemctl restart hdstradingopc
```

`namei -l /var/www/hdstradingopc/server/dist/index.js` prints the permissions
of every directory along the path, which shows immediately where the traversal
is blocked.

**A subdomain shows `SSL_ERROR_BAD_CERT_DOMAIN` with no way to bypass it**
Two causes, often together.

The certificate covers `hdstradingopc.com` and `www.hdstradingopc.com` only, so
any other name on this server fails to match. If the subdomain is unused —
`api`, left over from evaluating the split setup — delete its DNS record;
otherwise add it to the certificate:

```bash
certbot certonly --webroot -w /var/www/certbot \
  -d hdstradingopc.com -d www.hdstradingopc.com -d api.hdstradingopc.com
```

The "no way to bypass" part is HSTS. If the header on the main site includes
`includeSubDomains`, browsers enforce HTTPS on *every* subdomain for a year —
including ones on other servers, like `crm` or `payroll`. Any of those served
over plain HTTP becomes unreachable, and visitors cannot click through the
warning. The shipped config omits `includeSubDomains` for that reason. Check
what yours sends:

```bash
curl -sI https://hdstradingopc.com | grep -i strict-transport
```

If it still says `includeSubDomains`, update `/etc/nginx/sites-available/hdstradingopc`
from `deploy/nginx.conf` and reload. Browsers pick up the corrected policy the
next time someone visits the main site; until then, affected visitors can clear
it via `about:networking#hsts` in Firefox or `chrome://net-internals/#hsts` in
Chrome.

**`fatal: detected dubious ownership in repository`**
Git refuses to touch a repository owned by someone other than the user running
it. This means the checkout got `chown`ed to `hds` at some point — an earlier
version of this guide did that. Put it back to root and tell git the directory
is fine:

```bash
git config --global --add safe.directory /var/www/hdstradingopc
chown -R root:root /var/www/hdstradingopc
# The service still has to be able to enter the directory it runs from.
chmod 755 /var/www/hdstradingopc
```

Then re-create the database directory, which *is* meant to belong to `hds`:

```bash
mkdir -p /var/www/hdstradingopc/server/data
chown -R hds:hds /var/www/hdstradingopc/server/data
```

Until this is fixed every git command fails, so a `git fetch` or `git checkout`
appears to do nothing.

**`cp: cannot stat '.env.example': No such file or directory`**
The code is not actually there. Run `ls -a` in `/var/www/hdstradingopc` — there
are two causes, and the listing tells them apart:

- You see `.bashrc` and `.profile` but no `client/`. The directory was created
  by `adduser`, so `git clone` refused to write into it ("destination path
  already exists and is not an empty directory"). Use the
  [If the directory already existed](#if-the-directory-already-existed) recipe
  in step 3.
- You see only `README.md`. The clone worked but landed on `main`, which holds
  only the README. Check out the branch as shown in step 3.

Leave the checkout owned by root either way — only `server/data` belongs to
`hds`.

**The site shows "has not been built yet"**
The client build is missing. Run `npm run build`, then restart.

**502 Bad Gateway**
The Node process is not running. `systemctl status hdstradingopc` and
`journalctl -u hdstradingopc -n 50` will say why. The usual cause is a missing
`ADMIN_PASSWORD` or `SESSION_SECRET` — the server deliberately refuses to start
in production without them rather than leave the admin panel unprotected.

**Payments succeed but orders stay unpaid**
The webhook is not reaching the server, or its secret is wrong. Check the
delivery log in the PayMongo dashboard, and confirm `PAYMONGO_WEBHOOK_SECRET`
matches. Rejected webhooks are logged as
`Rejected PayMongo webhook with an invalid signature`.

**Emails are not arriving**
Look for `[email not sent — SMTP not configured]` in the log; that means the
SMTP settings are blank. If they are set and mail still fails, the log records
the SMTP error. Gmail requires an App Password, not the account password.

**Courier rates say "Indicative rate"**
Lalamove credentials are missing, or the customer did not pin a map location. The order still goes through — staff confirm the exact courier
fee before dispatch.

**Out of disk space**
Check with `df -h`. Old backups in `/var/backups/hds` are the usual culprit.
