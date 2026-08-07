/**
 * admin-auth.js
 * Single-admin login with: bcrypt password check, TOTP 2FA, Turnstile
 * CAPTCHA, timing-safe username comparison, CSRF token issuance, and a
 * session-epoch-based "log out everywhere" endpoint.
 *
 * Credentials/secrets live only in .env — see INTEGRATION.md for how
 * to generate ADMIN_PASSWORD_HASH and ADMIN_TOTP_SECRET.
 */
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");

const { verifyTurnstile } = require("../middleware/verifyTurnstile");
const { verifyTotpCode } = require("../middleware/totp");
const { issueCsrfCookie } = require("../middleware/csrf");
const { getEpoch, bumpEpoch } = require("../middleware/sessionEpoch");
const { requireAdmin } = require("../middleware/requireAdmin");
const { logAdminAction } = require("../middleware/auditLog");

const router = express.Router();

// Strict on purpose — this is the single most sensitive endpoint on the
// whole site. 5 attempts per 15 minutes per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ error: "Too many login attempts. Try again later." }),
});

const loginValidators = [
  body("username").trim().notEmpty().withMessage("Username is required."),
  body("password").notEmpty().withMessage("Password is required."),
  body("totpCode").optional({ checkFalsy: true }).isString().trim(),
  body("turnstileToken").optional({ checkFalsy: true }).isString().trim(),
];

/**
 * Constant-time string comparison — used for the username check so a
 * response-time difference can't be used to enumerate valid usernames
 * (bcrypt.compare already prevents this for the password itself, but
 * the username was previously compared with plain ===).
 */
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid a length-based
    // timing signal, even though the result is discarded.
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

router.post("/login", loginLimiter, loginValidators, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  const { username, password, totpCode, turnstileToken } = req.body;

  try {
    // CAPTCHA first — cheapest check, blocks scripted brute force before
    // any password hashing work happens.
    const captcha = await verifyTurnstile(turnstileToken, req.ip);
    if (!captcha.success) {
      return res.status(400).json({ error: "CAPTCHA verification failed." });
    }

    const validUsername = timingSafeStringEqual(username, process.env.ADMIN_USERNAME || "");
    const hashToCheck = validUsername
      ? process.env.ADMIN_PASSWORD_HASH
      : "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid";
    const validPassword = await bcrypt.compare(password, hashToCheck);

    if (!validUsername || !validPassword) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    if (!verifyTotpCode(totpCode)) {
      return res.status(401).json({ error: "Invalid or missing authentication code." });
    }

    const token = jwt.sign(
      { role: "admin", username, epoch: getEpoch() },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.cookie("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
    });
    const csrfToken = issueCsrfCookie(res);

    logAdminAction(req, "auth.login", {});

    res.json({ success: true, csrfToken });
  } catch (error) {
    error.clientMessage = "Login failed. Please try again.";
    next(error);
  }
});

router.post("/logout", requireAdmin, (req, res) => {
  logAdminAction(req, "auth.logout", {});
  res.clearCookie("admin_token");
  res.clearCookie("csrf_token");
  res.json({ success: true });
});

// "Log out everywhere" — bumps the session epoch, which instantly
// invalidates every outstanding JWT, including the one used to call
// this endpoint. Use this if you suspect a token was ever leaked.
router.post("/revoke-sessions", requireAdmin, (req, res) => {
  bumpEpoch();
  logAdminAction(req, "auth.revoke_all_sessions", {});
  res.clearCookie("admin_token");
  res.clearCookie("csrf_token");
  res.json({ success: true, message: "All sessions revoked. Please log in again." });
});

// Lets the admin frontend check "am I still logged in?" on page load
router.get("/session", (req, res) => {
  const token = req.cookies?.admin_token;
  if (!token) return res.json({ authenticated: false });

  try {
    const jwtLib = require("jsonwebtoken");
    const payload = jwtLib.verify(token, process.env.ADMIN_JWT_SECRET);
    if (payload.epoch !== getEpoch()) {
      return res.json({ authenticated: false });
    }
    res.json({ authenticated: true, csrfToken: req.cookies?.csrf_token || null });
  } catch {
    res.json({ authenticated: false });
  }
});

module.exports = router;
