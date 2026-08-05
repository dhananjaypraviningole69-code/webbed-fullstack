const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const productsPath = path.join(__dirname, "..", "data", "products.json");

// GET /api/products — returns the full template catalog
router.get("/", (req, res, next) => {
  try {
    const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));
    res.json(products);
  } catch (error) {
    error.clientMessage = "Could not load products.";
    next(error);
  }
});

module.exports = router;
