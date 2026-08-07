/**
 * productBackup.js
 * Snapshots data/products.json before every mutating write, so a bad
 * edit or delete is recoverable. Keeps the most recent MAX_BACKUPS
 * snapshots and prunes older ones automatically.
 */
const fs = require("fs");
const path = require("path");

const productsPath = path.join(__dirname, "..", "data", "products.json");
const backupsDir = path.join(__dirname, "..", "data", "backups");
const MAX_BACKUPS = 20;

function snapshotProducts() {
  fs.mkdirSync(backupsDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir, `products-${timestamp}.json`);

  try {
    fs.copyFileSync(productsPath, backupPath);
  } catch (err) {
    console.error("Failed to snapshot products.json:", err);
    return; // don't block the write on a backup failure
  }

  // Prune: keep only the newest MAX_BACKUPS files
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith("products-") && f.endsWith(".json"))
    .sort(); // ISO timestamps in the filename sort chronologically

  const excess = files.length - MAX_BACKUPS;
  if (excess > 0) {
    files.slice(0, excess).forEach((f) => {
      fs.unlinkSync(path.join(backupsDir, f));
    });
  }
}

module.exports = { snapshotProducts };
