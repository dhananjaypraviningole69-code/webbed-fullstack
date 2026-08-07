/**
 * auditLog.js
 * Append-only log of every admin mutation. Answers "what changed, when,
 * by whom" after the fact — nothing here is used for authorization,
 * only forensics/accountability.
 *
 * Not committed to git (add data/admin-audit.log to .gitignore) since
 * it can contain operational detail you may not want in a public repo.
 */
const fs = require("fs");
const path = require("path");

const logPath = path.join(__dirname, "..", "data", "admin-audit.log");

/**
 * @param {object} req - the Express request (used for admin identity + IP)
 * @param {string} action - short action code, e.g. "product.update"
 * @param {object} details - anything useful for reconstructing the change
 */
function logAdminAction(req, action, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    admin: req.admin?.username || "unknown",
    ip: req.ip,
    action,
    details,
  };
  try {
    fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
  } catch (err) {
    // Logging must never break the actual request — just report it
    console.error("Failed to write audit log entry:", err);
  }
}

module.exports = { logAdminAction };
