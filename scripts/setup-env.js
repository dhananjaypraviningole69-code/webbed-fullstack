/**
 * setup-env.js
 * Runs automatically via `npm run setup` / `npm run start:all`.
 * Creates .env from .env.example on first run so a fresh clone can
 * actually boot — it will still be missing real secret VALUES (Gmail
 * app password, Razorpay keys, etc.), but the server will start in
 * development mode and tell you clearly which features are
 * unconfigured rather than crashing.
 */
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
const examplePath = path.join(__dirname, "..", ".env.example");

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log("\n✔ Created .env from .env.example — this is a fresh setup.");
  console.log("  The server will start, but contact email, Turnstile CAPTCHA,");
  console.log("  Razorpay payments, and the admin panel won't work until you");
  console.log("  fill in real values in .env. See README.md for how to");
  console.log("  generate each secret.\n");
} else {
  console.log("✔ .env already exists — leaving it as-is.");
}
