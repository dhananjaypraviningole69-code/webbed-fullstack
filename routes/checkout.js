const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { body, validationResult } = require("express-validator");

const { checkoutLimiter } = require("../middleware/rateLimiters");

const router = express.Router();
const productsPath = path.join(__dirname, "..", "data", "products.json");

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }

  const Razorpay = require("razorpay");

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

const checkoutValidators = [
  body("productId")
    .trim()
    .escape()
    .isLength({ min: 1, max: 60 })
    .withMessage("A valid product is required."),
];

// Create a Razorpay order.
// POST /api/checkout
router.post(
  "/",
  checkoutLimiter,
  checkoutValidators,
  async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: errors.array()[0].msg,
      });
    }

    const razorpay = getRazorpay();

    if (!razorpay) {
      return res.status(500).json({
        error: "Razorpay is not configured yet.",
      });
    }

    try {
      const products = JSON.parse(
        fs.readFileSync(productsPath, "utf-8")
      );

      // IMPORTANT:
      // The browser sends only productId.
      // The server gets the real price from products.json.
      const product = products.find(
        (p) => p.id === req.body.productId
      );

      if (!product) {
        return res.status(404).json({
          error: "Template not found.",
        });
      }

      const price = Number(product.price);

      if (!Number.isFinite(price) || price <= 0) {
        return res.status(500).json({
          error: "This product has an invalid price.",
        });
      }

      // Razorpay expects the amount in the smallest currency unit.
      // ₹500 → 50000 paise.
      const amount = Math.round(price * 100);

      const order = await razorpay.orders.create({
        amount,
        currency: process.env.RAZORPAY_CURRENCY || "INR",
        receipt: `webbed_${String(product.id).slice(0, 20)}_${Date.now()}`,
        notes: {
          productId: String(product.id),
          productName: String(product.name).slice(0, 200),
        },
      });

      return res.json({
        success: true,
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        productId: product.id,
        productName: product.name,
      });
    } catch (error) {
      console.error("Razorpay order creation error:", error);

      error.clientMessage =
        "Could not start checkout. Please try again.";

      next(error);
    }
  }
);

// Verify the payment after Razorpay Checkout succeeds.
// POST /api/checkout/verify
router.post("/verify", async (req, res, next) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({
        error: "Incomplete payment verification data.",
      });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        error: "Razorpay verification is not configured.",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    const signaturesMatch =
      expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(razorpay_signature)
      );

    if (!signaturesMatch) {
      return res.status(400).json({
        error: "Payment verification failed.",
      });
    }

    return res.json({
      success: true,
      message: "Payment verified successfully.",
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });
  } catch (error) {
    console.error("Razorpay verification error:", error);

    error.clientMessage =
      "Could not verify the payment. Please try again.";

    next(error);
  }
});

module.exports = router;
