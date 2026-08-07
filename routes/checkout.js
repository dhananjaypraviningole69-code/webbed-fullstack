/**
 * checkout.js — Razorpay checkout + payment verification
 *
 * RECONSTRUCTED from the documented spec of your live implementation
 * (built with GPT in Termux) — I never received your actual current
 * file. Diff this against your live routes/checkout.js before
 * replacing it; the flow described below matches what you told me was
 * already working:
 *
 *   1. Client sends productId only.
 *   2. Server creates a Razorpay order using the server-trusted price
 *      from data/products.json — the client's price is never trusted.
 *   3. Payment happens client-side via Razorpay Checkout.
 *   4. Client posts the payment result to /verify.
 *   5. Server verifies the HMAC signature, fetches the order AND the
 *      payment from Razorpay directly (doesn't trust the client's
 *      claim that payment succeeded), confirms order.status === "paid"
 *      and payment.status === "captured".
 *   6. Server derives productId from its OWN order.notes (set in step 2
 *      by the server, not the client) — not from anything the client
 *      sent in the verify request.
 *   7. Server records an entitlement, then issues a short-lived
 *      one-time download token (completes the pending token migration)
 *      and returns it to the client.
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { body, validationResult } = require("express-validator");

const { checkoutLimiter } = require("../middleware/rateLimiters");
const { issueDownloadToken } = require("../middleware/downloadTokens");

const router = express.Router();
const productsPath = path.join(__dirname, "..", "data", "products.json");
const entitlementsPath = path.join(__dirname, "..", "data", "entitlements.json");

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  const Razorpay = require("razorpay");
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function readProducts() {
  return JSON.parse(fs.readFileSync(productsPath, "utf-8"));
}

function readEntitlements() {
  if (!fs.existsSync(entitlementsPath)) return [];
  return JSON.parse(fs.readFileSync(entitlementsPath, "utf-8"));
}

function saveEntitlement({ paymentId, orderId, productId }) {
  const entitlements = readEntitlements();
  // Deduplicate by paymentId — a retried/duplicate verify call
  // shouldn't create two entitlement records.
  if (entitlements.some((e) => e.paymentId === paymentId)) {
    return entitlements.find((e) => e.paymentId === paymentId);
  }
  const record = {
    paymentId,
    orderId,
    productId,
    createdAt: new Date().toISOString(),
  };
  entitlements.push(record);
  fs.writeFileSync(entitlementsPath, JSON.stringify(entitlements, null, 2));
  return record;
}

// --- POST /api/checkout — create a Razorpay order ------------------------
const checkoutValidators = [
  body("productId").trim().escape().isLength({ min: 1, max: 60 })
    .withMessage("A valid product is required."),
];

router.post("/", checkoutLimiter, checkoutValidators, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const razorpay = getRazorpay();
  if (!razorpay) {
    return res.status(500).json({
      error: "Payments are not configured yet. Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to .env.",
    });
  }

  try {
    const products = readProducts();
    const product = products.find((p) => p.id === req.body.productId);
    if (!product) {
      return res.status(404).json({ error: "Template not found." });
    }

    // Server-trusted price only — never accept a price from the client.
    const amount = Math.round(product.price * 100); // INR → paise

    const order = await razorpay.orders.create({
      amount,
      currency: process.env.RAZORPAY_CURRENCY || "INR",
      notes: {
        productId: product.id,
        productName: product.name,
      },
    });

    res.json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      productId: product.id,
      productName: product.name,
    });
  } catch (error) {
    error.clientMessage = "Could not start checkout. Please try again.";
    next(error);
  }
});

// --- POST /api/checkout/verify — verify payment, issue download token ----
const verifyValidators = [
  body("razorpay_order_id").trim().notEmpty(),
  body("razorpay_payment_id").trim().notEmpty(),
  body("razorpay_signature").trim().notEmpty(),
];

router.post("/verify", checkoutLimiter, verifyValidators, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Missing payment verification fields." });
  }

  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: "Payments are not configured yet." });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  try {
    // 1. Verify the HMAC signature Razorpay sent back.
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const signatureBuf = Buffer.from(razorpay_signature);
    const expectedBuf = Buffer.from(expectedSignature);
    const signatureValid =
      signatureBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(signatureBuf, expectedBuf);

    if (!signatureValid) {
      return res.status(400).json({ error: "Payment signature verification failed." });
    }

    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(500).json({ error: "Payments are not configured yet." });
    }

    // 2. Don't trust the client's word that payment succeeded — fetch
    // both the order and the payment directly from Razorpay.
    const order = await razorpay.orders.fetch(razorpay_order_id);
    if (order.status !== "paid") {
      return res.status(400).json({ error: "Order is not marked as paid." });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== "captured") {
      return res.status(400).json({ error: "Payment is not captured." });
    }

    // 3. productId comes from the order's own notes — set server-side
    // at order-creation time, never from anything the client sends here.
    const productId = order.notes?.productId;
    const products = readProducts();
    const product = products.find((p) => p.id === productId);
    if (!product) {
      return res.status(400).json({ error: "Product referenced by this order no longer exists." });
    }

    saveEntitlement({ paymentId: razorpay_payment_id, orderId: razorpay_order_id, productId });

    // 4. Issue the one-time download token — this is the piece that
    // completes the paymentId-in-URL → token migration.
    const downloadToken = issueDownloadToken({ productId, paymentId: razorpay_payment_id });

    res.json({
      success: true,
      productId,
      productName: product.name,
      downloadToken,
    });
  } catch (error) {
    error.clientMessage = "Payment verification failed. Contact support with your payment ID.";
    next(error);
  }
});

module.exports = router;
