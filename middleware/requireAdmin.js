/**
 * requireAdmin.js
 * Verifies the admin_token httpOnly cookie (a signed JWT) AND that its
 * embedded session epoch still matches the current one — this is what
 * makes "revoke all sessions" actually work. A token issued before the
 * epoch was bumped is rejected even though its signature is still valid.
 */
const jwt = require("jsonwebtoken");
const { getEpoch } = require("./sessionEpoch");

function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_token;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (payload.role !== "admin") {
      return res.status(403).json({ error: "Not authorized." });
    }
    if (payload.epoch !== getEpoch()) {
      return res.status(401).json({ error: "Session revoked. Please log in again." });
    }
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

module.exports = { requireAdmin };
