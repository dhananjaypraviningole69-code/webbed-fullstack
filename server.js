/**
 * server.js — Webbed backend
 * Serves the static frontend and exposes the API routes:
 *   GET  /api/products         → the template catalog (sort/filter data)
 *   GET  /api/reviews          → all reviews
 *   POST /api/reviews          → submit a new review
 *   POST /api/contact          → send a contact-form email via nodemailer
 *   POST /api/checkout         → create a Stripe Checkout session
 *
 * Security middleware order matters — helmet and hpp run first, then
 * CORS, then body parsing (with size limits), then routes, then the
 * 404 handler, then the centralized error handler last.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const path = require("path");

const productsRouter = require("./routes/products");
const reviewsRouter = require("./routes/reviews");
const contactRouter = require("./routes/contact");
const checkoutRouter = require("./routes/checkout");
const { apiLimiter } = require("./middleware/rateLimiters");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy hop (Render/Railway sit behind one) so
// express-rate-limit and req.ip see the real client IP, not the proxy's.
app.set("trust proxy", 1);

// --- Security headers -------------------------------------------------
app.use(
  helmet({
    // Content-Security-Policy is deliberately scoped to what this page
    // actually loads: Google Fonts, jsdelivr (EmailJS SDK on other
    // pages), and Cloudflare Turnstile. Tighten further if you remove
    // any of these.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://challenges.cloudflare.com", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["https://challenges.cloudflare.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    // HSTS: force HTTPS for a year, including subdomains. Only takes
    // effect once the site is actually served over HTTPS (true on
    // Render/Railway by default).
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    // X-Frame-Options: DENY — this site should never be framed
    frameguard: { action: "deny" },
    // X-Content-Type-Options: nosniff — helmet enables this by default
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// Permissions-Policy isn't covered by helmet's defaults — set explicitly
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(self)"
  );
  next();
});

// helmet() already disables X-Powered-By, but it's set explicitly here
// too so it's obvious at a glance and survives even if helmet config
// changes later.
app.disable("x-powered-by");

// --- CORS: whitelist, not wide open ------------------------------------
// ALLOWED_ORIGINS is a comma-separated list in .env, e.g.
// "https://webbed-store.onrender.com,https://webbed.dev"
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/non-browser requests (no Origin header) and
      // any origin explicitly whitelisted in .env.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: false, // no cookies/auth headers are used by this API
  })
);

// --- Body parsing with size limits -------------------------------------
// 10 KB is generous for this app's forms (name/email/message/review
// text) and blocks oversized-payload abuse.
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// --- HTTP Parameter Pollution protection --------------------------------
app.use(hpp());

app.use(express.static(path.join(__dirname, "public")));

// --- Routes --------------------------------------------------------------
app.use("/api/products", apiLimiter, productsRouter);
app.use("/api/reviews", apiLimiter, reviewsRouter);
app.use("/api/contact", contactRouter); // has its own stricter limiter inside
app.use("/api/checkout", checkoutRouter); // has its own stricter limiter inside

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// --- 404 + centralized error handling (must be last) ---------------------
app.use("/api", notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Webbed server running on http://localhost:${PORT}`);
});
