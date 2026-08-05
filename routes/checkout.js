const express = require("express");
const fs = require("fs");
const path = require("path");
const { body, validationResult } = require("express-validator");

const { checkoutLimiter } = require("../middleware/rateLimiters");

const router = express.Router();
const productsPath = path.join(__dirname, "..", "data", "products.json");

// Stripe is only required at request time so the server can still boot
// without a key set (useful while you're still wiring things up).
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return require("stripe")(process.env.STRIPE_SECRET_KEY);
}

const checkoutValidators = [
  body("productId").trim().escape().isLength({ min: 1, max: 60 })
    .withMessage("A valid product is required."),
];

// POST /api/checkout — body: { productId }
router.post("/", checkoutLimiter, checkoutValidators, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { productId } = req.body;
  const stripe = getStripe();

  if (!stripe) {
    return res.status(500).json({
      error: "Payments are not configured yet. Add STRIPE_SECRET_KEY to your .env file.",
    });
  }

  try {
    const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
    // Only ever trust price data from our own catalog file, never from
    // the client — this is what stops someone POSTing a fake low price.
    const product = products.find((p) => p.id === productId);

    if (!product) {
      return res.status(404).json({ error: "Template not found." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${product.name} — Website Template`,
              description: product.description,
            },
            unit_amount: Math.round(product.price * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/?purchase=success`,
      cancel_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/?purchase=cancelled`,
    });

    res.json({ url: session.url });
  } catch (error) {
    error.clientMessage = "Could not start checkout. Please try again.";
    next(error);
  }
});

module.exports = router;
