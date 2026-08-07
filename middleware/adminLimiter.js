/**
 * adminLimiter.js
 * Rate limiting for the admin CRUD surface. Separate from the public
 * rate limiters (contact/checkout/reviews) already in
 * middleware/rateLimiters.js — this one guards /api/admin/products/*.
 *
 * A stolen session token or XSS-triggered request now hits a ceiling
 * instead of being able to mass-edit/mass-delete unthrottled.
 */
const rateLimit = require("express-rate-limit");

const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ error: "Too many admin actions. Please slow down." }),
});

module.exports = { adminActionLimiter };
