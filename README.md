# Webbed — Consolidated Project

Everything from our sessions in one place: catalog + filters, template
detail modal, admin CMS, Razorpay checkout, token-gated downloads,
reviews, contact form, and full security hardening.

## ⚠️ Read this first

`routes/checkout.js` and `routes/downloads.js` in this bundle are
**reconstructed** from the detailed spec you pasted earlier (order
creation → HMAC signature verify → order/payment status check →
entitlement → download token) — I never received your actual live
files after the Razorpay work you did with GPT. Before replacing your
live `~/webbed-fullstack`, diff these two files against what's
currently running:

```bash
diff routes/checkout.js ~/webbed-fullstack/routes/checkout.js
diff routes/downloads.js ~/webbed-fullstack/routes/downloads.js
```

If your live version has custom logic beyond what's described above,
keep your version and only take the download-token pieces
(`issueDownloadToken` call after `saveEntitlement`, and the token-based
rewrite of `downloads.js`) from this one.

## One-command startup

```bash
npm run start:all
```

This does three things: creates `.env` from `.env.example` if it
doesn't exist yet, runs `npm install`, then starts the server. First
run will boot successfully but most features (email, CAPTCHA,
payments, admin login) stay disabled/unconfigured until you fill in
real values in `.env` — the server tells you this on startup.

For every run after the first (once `.env` is filled in and
`node_modules` exists), plain `npm start` is enough.

## Filling in `.env`

Open `.env` (created on first run) and fill in each section — every
value has a comment above it explaining exactly how to generate it:

- **Contact form**: Gmail address + app password
- **Turnstile**: free CAPTCHA keys from Cloudflare — the site key also
  needs pasting into `public/index.html` and `public/admin.html`
  (search both for `YOUR_TURNSTILE_SITE_KEY`)
- **Razorpay**: your key ID + secret from the Razorpay dashboard
- **Admin panel**: username, a bcrypt password hash, a random JWT
  secret, and a TOTP 2FA secret — generation commands are in the
  `.env.example` comments

## Adding your paid template files

Put the real ZIP files buyers will download in `private-templates/`,
named to match each product's `id` in `data/products.json`:
```
private-templates/maple-stone.zip
private-templates/ironclad.zip
private-templates/blackwell-voss.zip
```
This folder is gitignored — never commit real paid ZIPs to GitHub.

## What's included

**Public site**
- `/` — home page (hero, founder section with your photo/contact info, reviews, contact form)
- `/template` — catalog with filter/sort + click-to-open detail modal (gallery, specs, Razorpay buy button)
- Reviews are live — fetched from and posted to the server, not static
- Contact form sends real email (nodemailer) and is CAPTCHA-protected (Turnstile)

**Payments**
- Razorpay checkout, server-trusted pricing only (client never sets the price)
- Full verification: HMAC signature + live order/payment status fetch from Razorpay, not just trusting the client's callback
- Entitlements recorded per payment, deduplicated
- Downloads gated by a short-lived (30 min), one-time-use token issued only after verified payment — no more paymentId-in-URL

**Admin panel** (`/admin.html`)
- Login: password (bcrypt) + TOTP 2FA + CAPTCHA
- Add/edit/delete templates, upload up to 5 images + 1 video each, all without touching files
- CSRF-protected, rate-limited, every action audit-logged, every write auto-backed-up, deletes require typing the exact template name
- "Log out everywhere" — instantly invalidates all sessions

**Security**
- Helmet (CSP, HSTS, frame protection), CORS whitelist, HPP protection, 10KB body limits
- Separate rate limits per endpoint class (contact, checkout, reviews, admin actions, admin login)
- Centralized error handling — clients never see stack traces
- `.gitignore` covers every piece of runtime/secret data (`.env`, uploads, audit log, backups, entitlements, tokens)

## Deploying beyond localhost

This needs a real Node host (not static-only hosting) — Render or
Railway both work. Set every `.env` value as an environment variable in
their dashboard, set `NODE_ENV=production` (the server refuses to boot
in production without the admin secrets set — fails loudly instead of
running half-configured), and set `ALLOWED_ORIGINS`/`CLIENT_URL` to
your real deployed URL.

Note: `public/uploads/`, `data/backups/`, and `private-templates/` are
all on local disk — on hosts with an ephemeral filesystem (e.g. Render
free tier), these reset on every redeploy. Fine for local/testing; real
object storage (S3, Cloudinary) is the eventual production fix.
