/**
 * rateLimiters.js
 * Separate limiters per route class, since they have very different
 * abuse profiles: the contact form is a spam target, checkout is a
 * fraud/scraping target, and general API reads just need a sane ceiling.
 */
const rateLimit = require("express-rate-limit");

// Shared response shape so the frontend can handle all 429s the same way
const limitHandler = (req, res) => {
  res.status(429).json({
    error: "Too many requests. Please wait a bit and try again.",
  });
};

// Contact form: generous enough for a real visitor, tight enough to
// block scripted spam (5 submissions per 15 minutes per IP)
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

// Checkout: payment-adjacent, so kept stricter (10 attempts per 15 min)
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

// Review submissions: prevent review-bombing / spam (8 per hour)
const reviewsWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

// General API reads (products, GET reviews): high ceiling, mainly to
// blunt scraping/DoS rather than restrict normal browsing
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

module.exports = {
  contactLimiter,
  checkoutLimiter,
  reviewsWriteLimiter,
  apiLimiter,
};
