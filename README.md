# Webbed — Full-Stack Template Store

A complete storefront for selling website templates: product catalog with
sort/filter, working reviews (fetched + submitted live), a contact form
that sends real email, and Stripe checkout for payments.

## What's inside

```
webbed-fullstack/
├── server.js              Express app entry point
├── package.json
├── .env.example            Copy to .env and fill in real values
├── routes/
│   ├── products.js         GET  /api/products
│   ├── reviews.js          GET/POST /api/reviews
│   ├── contact.js          POST /api/contact  (sends email via nodemailer)
│   └── checkout.js         POST /api/checkout (Stripe Checkout session)
├── data/
│   ├── products.json       Your 3 templates — edit to add more
│   └── reviews.json        Review storage (a real DB is a later upgrade)
└── public/
    ├── index.html
    ├── css/style.css
    └── js/main.js
```

## 1. Run it locally

You'll need [Node.js](https://nodejs.org) installed (v18+).

```bash
cd webbed-fullstack
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `CONTACT_EMAIL_USER` / `CONTACT_EMAIL_PASS` — a Gmail address + an
  ["app password"](https://myaccount.google.com/apppasswords) (not your
  normal password) so the contact form can send real emails
- `STRIPE_SECRET_KEY` — from your
  [Stripe dashboard](https://dashboard.stripe.com/apikeys), use a **test
  key** (`sk_test_...`) until you're ready to accept real payments
- `ALLOWED_ORIGINS` — your live site URL(s), comma-separated. The API
  rejects requests from any origin not on this list.
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` — free from
  [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
  The site key also needs to be pasted into `public/index.html`, replacing
  `YOUR_TURNSTILE_SITE_KEY` in the `data-sitekey` attribute on the contact
  form's CAPTCHA widget — it's public by design, safe to put in HTML.
  **Without this configured, the contact form will reject all
  submissions once `NODE_ENV=production`** (it fails closed on purpose).

Then run:

```bash
npm start
```

Visit `http://localhost:3000`. Everything — catalog, reviews, contact
form, checkout — works against the real backend at this point.

## 2. Add your own templates

Edit `data/products.json`. Each entry needs: `id`, `name`, `category`,
`style`, `pages`, `price`, `priceTier` (`"budget"` or `"premium"` — this
drives the Budget filter), `features` (array — drives the "must-have
features" filter), `rating`, `reviewCount`, `gradient` (CSS gradient used
as the card thumbnail — swap for a real screenshot URL later if you want),
and `description`.

## 3. Deploy it

This needs a server that stays running (not a static host like plain
Netlify) because of the API routes. Easiest free options:

**Render** (recommended, free tier available)
1. Push this folder to a GitHub repo
2. New → Web Service on render.com, connect the repo
3. Build command: `npm install` — Start command: `npm start`
4. Add your `.env` values under Environment in the Render dashboard
5. Update `CLIENT_URL` to your live Render URL once deployed (needed for
   Stripe's success/cancel redirect)

**Railway** works the same way and is equally simple.

## 4. Going live with payments

The checkout route is fully wired to Stripe's hosted Checkout — you don't
need to build a payment form yourself. Once you swap in your **live**
Stripe secret key (starts with `sk_live_`) instead of the test key,
real payments will work immediately with zero code changes.

## Security hardening applied

This project ships with production security middleware already wired in:

- **Helmet** — sets HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, and a scoped Content-Security-Policy
- **Permissions-Policy** header set explicitly (blocks camera/mic/
  geolocation by default)
- **CORS whitelist** — only origins listed in `ALLOWED_ORIGINS` can call
  the API; wide-open `cors()` is gone
- **Rate limiting** — separate limits for contact (5/15min), checkout
  (10/15min), review submissions (8/hour), and general API reads
  (300/15min)
- **Input validation & sanitization** (`express-validator`) — every
  field is length-checked, emails are format-validated, and text is
  escaped before use
- **Request size limits** — JSON/URL-encoded bodies capped at 10 KB
- **HPP protection** — blocks HTTP Parameter Pollution
- **`X-Powered-By` disabled**
- **CAPTCHA (Cloudflare Turnstile)** on the contact form, plus explicit
  stripping of `\r\n` from user input before it's used in email headers
  (prevents header injection)
- **Centralized error handling** — real errors are logged server-side
  only; clients only ever see a safe, generic message
- **`.gitignore`** — `.env` and `node_modules/` are excluded so secrets
  never reach your GitHub repo

### Before your first production deploy

1. Run `npm install` locally, then `npm run audit` (`npm audit --omit=dev`)
   and fix anything it flags with `npm audit fix`
2. Set `NODE_ENV=production` in your Render/Railway environment variables
3. Fill in `ALLOWED_ORIGINS` with your real deployed URL — the site
   won't accept API calls from anywhere else
4. Set up Turnstile and paste the site key into `index.html` — the
   contact route refuses to send mail without a valid CAPTCHA token
   once `NODE_ENV=production`

### Further recommendations (not included, worth doing next)

- **Structured logging**: swap the `console.error` calls in
  `middleware/errorHandler.js` for a real logger (Winston or Pino) that
  ships to a log aggregator — plain console logs disappear when a free
  host restarts your instance
- **A real database** for reviews instead of a JSON file, once you're
  past the "just getting started" stage — see the note below
- **Automated dependency scanning**: enable GitHub's Dependabot on the
  repo so you get a PR automatically when a dependency has a known CVE
- **Helmet CSP tightening**: if you stop using Google Fonts, jsdelivr,
  or Turnstile, remove their entries from the CSP in `server.js` so the
  policy stays as narrow as what you actually load

## Notes

- Reviews are stored in `data/reviews.json` on the server's disk. This
  is fine for getting started, but on some hosts (like Render's free
  tier) the filesystem resets on redeploy — if that happens, move to a
  real database (SQLite or MongoDB) as a next step.
- The contact form uses Gmail SMTP for simplicity. For higher volume,
  swap nodemailer's transport for a dedicated service like SendGrid or
  Resend — the route logic stays the same.
