/**
 * totp.js
 * Thin wrapper around otplib for admin 2FA. The secret lives only in
 * .env as ADMIN_TOTP_SECRET — there's no per-user enrollment flow since
 * this is a single-admin system. See INTEGRATION.md for how to
 * generate the secret and add it to an authenticator app.
 */
const { authenticator } = require("otplib");

function verifyTotpCode(code) {
  if (!process.env.ADMIN_TOTP_SECRET) {
    // Fail closed in production — 2FA must be configured before the
    // admin panel is usable in prod. Development can proceed without
    // it so local setup isn't blocked before you've generated a secret.
    if (process.env.NODE_ENV === "production") return false;
    return true;
  }
  if (!code) return false;

  try {
    return authenticator.verify({ token: String(code), secret: process.env.ADMIN_TOTP_SECRET });
  } catch {
    return false;
  }
}

module.exports = { verifyTotpCode };
