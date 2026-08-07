/**
 * downloads.js
 * Final token-based design (replacing the interim paymentId-in-URL
 * approach). A token is only ever handed to the client after
 * checkout.js's /verify route confirms a real, captured payment.
 *
 * GET /api/download/:productId?token=...
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");

const { consumeDownloadToken } = require("../middleware/downloadTokens");

const router = express.Router();
const productsPath = path.join(__dirname, "..", "data", "products.json");
const privateTemplatesDir = path.join(__dirname, "..", "private-templates");

const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: "Too many download attempts." }),
});

router.get("/:productId", downloadLimiter, (req, res, next) => {
  const { productId } = req.params;
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "Missing download token." });
  }

  const result = consumeDownloadToken({ token, productId });
  if (!result.valid) {
    const messages = {
      not_found: "Invalid download link.",
      already_used: "This download link has already been used.",
      product_mismatch: "This download link is not valid for this template.",
      expired: "This download link has expired. Please contact support for a new one.",
    };
    return res.status(403).json({ error: messages[result.reason] || "Invalid download link." });
  }

  try {
    const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
    const product = products.find((p) => p.id === productId);
    if (!product) {
      return res.status(404).json({ error: "Template not found." });
    }

    const filePath = path.join(privateTemplatesDir, `${product.id}.zip`);
    if (!fs.existsSync(filePath)) {
      const err = new Error(`Missing template file: ${filePath}`);
      err.clientMessage = "This template's file isn't available right now. Contact support.";
      return next(err);
    }

    res.download(filePath, `${product.name.replace(/[^a-z0-9]/gi, "-")}.zip`);
  } catch (error) {
    error.clientMessage = "Could not process download.";
    next(error);
  }
});

module.exports = router;
