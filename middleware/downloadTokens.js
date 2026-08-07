/**
 * downloadTokens.js
 * Short-lived, one-time-use tokens gating paid template downloads.
 * Replaces the interim paymentId-in-URL approach.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tokensPath = path.join(__dirname, "..", "data", "download-tokens.json");
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function readTokens() {
  if (!fs.existsSync(tokensPath)) return [];
  return JSON.parse(fs.readFileSync(tokensPath, "utf-8"));
}

function writeTokens(tokens) {
  fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2));
}

/**
 * Issues a new one-time download token tied to a specific product +
 * payment. Call this right after a successful payment verification.
 */
function issueDownloadToken({ productId, paymentId }) {
  const tokens = readTokens();
  const token = crypto.randomBytes(32).toString("hex");
  const record = {
    token,
    productId,
    paymentId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    used: false,
  };
  tokens.push(record);
  writeTokens(tokens);
  return token;
}

/**
 * Validates a token for a given productId. On success, marks it used
 * (one-time use) and returns { valid: true }. Never throws — always
 * check the `valid` field.
 */
function consumeDownloadToken({ token, productId }) {
  const tokens = readTokens();
  const record = tokens.find((t) => t.token === token);

  if (!record) return { valid: false, reason: "not_found" };
  if (record.used) return { valid: false, reason: "already_used" };
  if (record.productId !== productId) return { valid: false, reason: "product_mismatch" };
  if (new Date(record.expiresAt) < new Date()) return { valid: false, reason: "expired" };

  record.used = true;
  record.usedAt = new Date().toISOString();
  writeTokens(tokens);
  return { valid: true };
}

module.exports = { issueDownloadToken, consumeDownloadToken };
