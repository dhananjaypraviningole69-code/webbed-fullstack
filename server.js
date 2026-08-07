/**
 * server.js — Webbed backend (consolidated)
 *
 * Public API:
 *   GET  /api/products              → template catalog
 *   GET  /api/reviews                → all reviews
 *   POST /api/reviews                → submit a review
 *   POST /api/contact                → contact form (nodemailer + Turnstile)
 *   POST /api/checkout               → create Razorpay order
 *   POST /api/checkout/verify        → verify payment, issue download token
 *   GET  /api/download/:productId    → token-gated template download
 *
 * Admin API (all behind requireAdmin + requireCsrf + rate limiting):
 *   POST /api/admin/login, /logout, /revoke-sessions, GET /session
 *   PATCH/POST/DELETE /api/admin/products/*
 *
 * Pages:
 *   GET  /              → public/index.html (via express.static)
 *   GET  /template       → public/templates.html (clean URL)
 *   GET  /admin.html      → public/admin.html (via express.static)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

const productsRouter = require("./routes/products");
const reviewsRouter = require("./routes/reviews");
const contactRouter = require("./routes/contact");
const checkoutRouter = require("./routes/checkout");
const downloadsRouter = require("./routes/downloads");
const adminAuthRouter = require("./routes/admin-auth");
const adminProductsRouter = require("./routes/admin-products");

const { apiLimiter } = require("./middleware/rateLimiters");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const { requireAdmin } = require("./middleware/requireAdmin");
const { requireCsrf } = require("./middleware/csrf");
const { adminActionLimiter } = require("./middleware/adminLimiter");

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure runtime directories exist on first boot
["data/backups", "public/uploads/templates", "private-templates"].forEach((dir) => {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
});

app.set("trust proxy", 1);

// --- Security headers ----------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://challenges.cloudflare.com",
          "https://cdn.jsdelivr.net",
          "https://checkout.razorpay.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://checkout.razorpay.com", "https://api.razorpay.com"],
        frameSrc: ["https://challenges.cloudflare.com", "https://api.razorpay.com", "https://checkout.razorpay.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(self)");
  next();
});
app.disable("x-powered-by");

// --- Startup env validation (fail fast in production) ---------------------
if (process.env.NODE_ENV === "production") {
  const required = ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "ADMIN_JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required env vars for production: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// --- CORS: whitelist ------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push(
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`
  );
}

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push(
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || !allowedOrigins.length) {
        // Note: if ALLOWED_ORIGINS is empty (e.g. fresh local dev setup),
        // this falls open so localhost testing isn't blocked. Set
        // ALLOWED_ORIGINS before deploying anywhere real.
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: false,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());
app.use(hpp());

app.use(express.static(path.join(__dirname, "public")));

// Clean URL for the catalog page
app.get("/template", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "templates.html"));
});

// --- Public API ------------------------------------------------------------
app.use("/api/products", apiLimiter, productsRouter);
app.use("/api/reviews", apiLimiter, reviewsRouter);
app.use("/api/contact", contactRouter); // has its own stricter limiter inside
app.use("/api/checkout", checkoutRouter); // has its own stricter limiter inside
app.use("/api/download", downloadsRouter); // has its own limiter inside

// --- Admin API ---------------------------------------------------------------
app.use("/api/admin", adminAuthRouter);
app.use("/api/admin/products", requireAdmin, requireCsrf, adminActionLimiter, adminProductsRouter);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Webbed server running on http://localhost:${PORT}`);
});
