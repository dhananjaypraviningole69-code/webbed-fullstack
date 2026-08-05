const express = require("express");
const fs = require("fs");
const path = require("path");
const { body, validationResult } = require("express-validator");

const { reviewsWriteLimiter } = require("../middleware/rateLimiters");

const router = express.Router();
const reviewsPath = path.join(__dirname, "..", "data", "reviews.json");

function readReviews() {
  return JSON.parse(fs.readFileSync(reviewsPath, "utf-8"));
}

function writeReviews(reviews) {
  fs.writeFileSync(reviewsPath, JSON.stringify(reviews, null, 2));
}

// GET /api/reviews — all reviews, newest first
router.get("/", (req, res, next) => {
  try {
    const reviews = readReviews().sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    res.json(reviews);
  } catch (error) {
    error.clientMessage = "Could not load reviews.";
    next(error);
  }
});

const reviewValidators = [
  body("name").trim().escape().isLength({ min: 2, max: 80 })
    .withMessage("Name must be between 2 and 80 characters."),
  body("productId").trim().escape().isLength({ min: 1, max: 60 })
    .withMessage("A valid product is required."),
  body("rating").isInt({ min: 1, max: 5 })
    .withMessage("Rating must be an integer between 1 and 5."),
  body("text").trim().escape().isLength({ min: 10, max: 600 })
    .withMessage("Review must be between 10 and 600 characters."),
];

// POST /api/reviews — submit a new review
router.post("/", reviewsWriteLimiter, reviewValidators, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
  }

  const { name, productId, rating, text } = req.body;

  try {
    const reviews = readReviews();
    const newReview = {
      id: reviews.length ? Math.max(...reviews.map((r) => r.id)) + 1 : 1,
      name,
      productId,
      rating: Number(rating),
      text,
      date: new Date().toISOString().slice(0, 10),
    };
    reviews.push(newReview);
    writeReviews(reviews);
    res.status(201).json(newReview);
  } catch (error) {
    error.clientMessage = "Could not save review.";
    next(error);
  }
});

module.exports = router;
