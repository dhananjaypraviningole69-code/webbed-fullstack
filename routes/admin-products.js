/**
 * admin-products.js
 * Protected CRUD for the product catalog, plus image/video upload.
 * Mounted behind requireAdmin + requireCsrf + adminActionLimiter in
 * server.js (see INTEGRATION.md) — nothing here re-checks auth, but
 * every mutating route DOES validate the product exists before doing
 * any filesystem work (this is what fixes the path-traversal issue:
 * the old version let multer create a directory from req.params.id
 * before any existence check ran).
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { body, param, validationResult } = require("express-validator");

const { snapshotProducts } = require("../middleware/productBackup");
const { logAdminAction } = require("../middleware/auditLog");

const router = express.Router();
const productsPath = path.join(__dirname, "..", "data", "products.json");
const uploadsRoot = path.join(__dirname, "..", "public", "uploads", "templates");

function readProducts() {
  return JSON.parse(fs.readFileSync(productsPath, "utf-8"));
}
function writeProducts(products) {
  snapshotProducts(); // back up the pre-change state first
  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
}

// Only lowercase letters, numbers, and hyphens are ever valid product
// IDs (enforced at creation time too). Anything else is rejected
// immediately, before it ever reaches a filesystem path.
const SAFE_ID_PATTERN = /^[a-z0-9-]+$/;

/**
 * Runs BEFORE multer. Validates the :id format AND that a product with
 * that ID actually exists — this is the fix for the path-traversal
 * issue: no directory gets created and no file gets written for an ID
 * that isn't a real, existing product.
 */
function validateProductExists(req, res, next) {
  const { id } = req.params;
  if (!SAFE_ID_PATTERN.test(id)) {
    return res.status(400).json({ error: "Invalid template ID." });
  }
  const products = readProducts();
  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ error: "Template not found." });
  }
  req._product = product; // stash for the handler, avoids re-reading the file
  next();
}

// --- Multer setup: images + video, strict type/size limits -------------
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

const storage = multer.diskStorage({
  destination(req, file, cb) {
    // Safe by the time this runs — validateProductExists already
    // confirmed req.params.id matches SAFE_ID_PATTERN AND is a real
    // product ID, so there's no way to reach an arbitrary path here.
    const dir = path.join(uploadsRoot, req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const extMap = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
    };
    const ext = extMap[file.mimetype] || "";
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = file.fieldname === "video" ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES;
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Unsupported file type."));
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_VIDEO_SIZE } });

function findProductOr404(req, res) {
  const products = readProducts();
  const product = products.find((p) => p.id === req.params.id);
  if (!product) {
    res.status(404).json({ error: "Template not found." });
    return null;
  }
  return { products, product };
}

// --- CRUD ----------------------------------------------------------------

const updateValidators = [
  param("id").trim().notEmpty(),
  body("name").optional().trim().escape().isLength({ min: 2, max: 80 }),
  body("category").optional().trim().escape().isLength({ min: 2, max: 60 }),
  body("style").optional().trim().escape().isLength({ min: 2, max: 60 }),
  body("pageType").optional().isIn(["Landing page", "Multipage"]),
  body("pageCount").optional().isInt({ min: 1, max: 50 }),
  body("price").optional().isFloat({ min: 0, max: 1000000 }),
  body("priceTier").optional().isIn(["budget", "premium"]),
  body("description").optional().trim().escape().isLength({ max: 600 }),
  body("clientNeed").optional().trim().escape().isLength({ max: 600 }),
  body("sellingPoint").optional().trim().escape().isLength({ max: 600 }),
  body("features").optional().isArray({ max: 12 }),
  body("specs").optional().isObject(),
];

router.patch("/:id", updateValidators, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const found = findProductOr404(req, res);
  if (!found) return;
  const { products, product } = found;

  const before = { ...product };
  const editableFields = [
    "name", "category", "style", "pageType", "pageCount", "price",
    "priceTier", "description", "clientNeed", "sellingPoint", "features", "specs",
  ];
  const changedFields = [];
  editableFields.forEach((field) => {
    if (req.body[field] !== undefined && req.body[field] !== product[field]) {
      changedFields.push(field);
      product[field] = req.body[field];
    }
  });

  try {
    writeProducts(products);
    logAdminAction(req, "product.update", {
      id: product.id,
      changedFields,
      priceBefore: before.price,
      priceAfter: product.price,
    });
    res.json(product);
  } catch (error) {
    error.clientMessage = "Could not save changes.";
    next(error);
  }
});

const createValidators = [
  body("id").trim().escape().isLength({ min: 2, max: 60 }).matches(SAFE_ID_PATTERN)
    .withMessage("ID must be lowercase letters, numbers, and hyphens only."),
  body("name").trim().escape().isLength({ min: 2, max: 80 }),
  body("category").trim().escape().isLength({ min: 2, max: 60 }),
  body("style").trim().escape().isLength({ min: 2, max: 60 }),
  body("pageType").isIn(["Landing page", "Multipage"]),
  body("pageCount").isInt({ min: 1, max: 50 }),
  body("price").isFloat({ min: 0, max: 1000000 }),
  body("priceTier").isIn(["budget", "premium"]),
  body("description").trim().escape().isLength({ max: 600 }),
];

router.post("/", createValidators, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const products = readProducts();
    if (products.some((p) => p.id === req.body.id)) {
      return res.status(409).json({ error: "A template with this ID already exists." });
    }

    const newProduct = {
      id: req.body.id,
      name: req.body.name,
      category: req.body.category,
      style: req.body.style,
      pages: req.body.pageType === "Multipage" ? "Multi-page" : "Single-page",
      pageType: req.body.pageType,
      pageCount: Number(req.body.pageCount),
      price: Number(req.body.price),
      priceTier: req.body.priceTier,
      features: Array.isArray(req.body.features) ? req.body.features : [],
      rating: 0,
      reviewCount: 0,
      gradient: req.body.gradient || "linear-gradient(135deg,#1E1638 0%,#6A38F1 100%)",
      description: req.body.description || "",
      clientNeed: req.body.clientNeed || "",
      sellingPoint: req.body.sellingPoint || "",
      images: [],
      video: null,
      specs: req.body.specs || {},
    };

    products.push(newProduct);
    writeProducts(products);
    logAdminAction(req, "product.create", { id: newProduct.id });
    res.status(201).json(newProduct);
  } catch (error) {
    error.clientMessage = "Could not create template.";
    next(error);
  }
});

// DELETE /api/admin/products/:id — body: { confirmName }
// Requires the caller to type the exact current product name, not just
// hit a client-side confirm() dialog (which a direct API call bypasses
// entirely). A pre-delete backup is also taken via writeProducts().
router.delete(
  "/:id",
  [param("id").trim().notEmpty(), body("confirmName").trim().notEmpty()],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: "Type the template's exact name to confirm deletion." });
    }

    const found = findProductOr404(req, res);
    if (!found) return;
    const { products, product } = found;

    if (req.body.confirmName !== product.name) {
      return res.status(400).json({ error: "Name doesn't match — deletion cancelled." });
    }

    try {
      const remaining = products.filter((p) => p.id !== product.id);
      writeProducts(remaining);

      const dir = path.join(uploadsRoot, product.id);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

      logAdminAction(req, "product.delete", { id: product.id, name: product.name });
      res.json({ success: true });
    } catch (error) {
      error.clientMessage = "Could not delete template.";
      next(error);
    }
  }
);

// --- Images: min 1, max 5 -------------------------------------------------
// validateProductExists runs BEFORE upload.single() — this is the fix.

router.post("/:id/images", validateProductExists, upload.single("image"), (req, res, next) => {
  const found = findProductOr404(req, res);
  if (!found) {
    if (req.file) fs.unlinkSync(req.file.path);
    return;
  }
  const { products, product } = found;

  if (!req.file) {
    return res.status(400).json({ error: "No image file received." });
  }
  if (req.file.size > MAX_IMAGE_SIZE) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Image must be under 5 MB." });
  }
  if ((product.images || []).length >= 5) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Maximum of 5 images per template." });
  }

  try {
    const publicUrl = `/uploads/templates/${product.id}/${req.file.filename}`;
    product.images = [...(product.images || []), publicUrl];
    writeProducts(products);
    logAdminAction(req, "product.image.add", { id: product.id, url: publicUrl });
    res.status(201).json({ images: product.images });
  } catch (error) {
    error.clientMessage = "Could not save image.";
    next(error);
  }
});

router.delete("/:id/images", validateProductExists, body("url").notEmpty(), (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: "Image URL is required." });

  const found = findProductOr404(req, res);
  if (!found) return;
  const { products, product } = found;

  try {
    product.images = (product.images || []).filter((img) => img !== req.body.url);
    writeProducts(products);

    const filename = path.basename(req.body.url);
    const filePath = path.join(uploadsRoot, product.id, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    logAdminAction(req, "product.image.remove", { id: product.id, url: req.body.url });
    res.json({ images: product.images });
  } catch (error) {
    error.clientMessage = "Could not remove image.";
    next(error);
  }
});

// --- Video: max 1 ----------------------------------------------------------

router.post("/:id/video", validateProductExists, upload.single("video"), (req, res, next) => {
  const found = findProductOr404(req, res);
  if (!found) {
    if (req.file) fs.unlinkSync(req.file.path);
    return;
  }
  const { products, product } = found;

  if (!req.file) {
    return res.status(400).json({ error: "No video file received." });
  }
  if (req.file.size > MAX_VIDEO_SIZE) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Video must be under 50 MB." });
  }

  try {
    if (product.video) {
      const oldPath = path.join(uploadsRoot, product.id, path.basename(product.video));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    product.video = `/uploads/templates/${product.id}/${req.file.filename}`;
    writeProducts(products);
    logAdminAction(req, "product.video.set", { id: product.id, url: product.video });
    res.status(201).json({ video: product.video });
  } catch (error) {
    error.clientMessage = "Could not save video.";
    next(error);
  }
});

router.delete("/:id/video", validateProductExists, (req, res, next) => {
  const found = findProductOr404(req, res);
  if (!found) return;
  const { products, product } = found;

  try {
    if (product.video) {
      const filePath = path.join(uploadsRoot, product.id, path.basename(product.video));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    product.video = null;
    writeProducts(products);
    logAdminAction(req, "product.video.remove", { id: product.id });
    res.json({ success: true });
  } catch (error) {
    error.clientMessage = "Could not remove video.";
    next(error);
  }
});

// Multer error formatting (file too large, bad type, etc.)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === "Unsupported file type.") {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
