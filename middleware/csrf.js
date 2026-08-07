/**
 * csrf.js
 * Double-submit-cookie CSRF protection, layered on top of SameSite=Strict
 * (defense in depth, not a replacement for it).
 *
 * On login: issue a random csrf_token cookie (NOT httpOnly, so the
 * frontend JS can read it) alongside the httpOnly admin_token cookie.
 * On every mutating admin request: require the same value in the
 * X-CSRF-Token header. An attacker who can trigger a cross-site request
 * (bypassing SameSite somehow) still can't read the cookie to put its
 * value in the header, since it's a different origin.
 */
const crypto = require("crypto");

function issueCsrfCookie(res) {
  const token = crypto.randomBytes(24).toString("hex");
  res.cookie("csrf_token", token, {
    httpOnly: false, // must be readable by frontend JS
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
  });
  return token;
}

function requireCsrf(req, res, next) {
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.get("X-CSRF-Token");

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF validation failed. Please refresh and try again." });
  }
  next();
}

module.exports = { issueCsrfCookie, requireCsrf };
