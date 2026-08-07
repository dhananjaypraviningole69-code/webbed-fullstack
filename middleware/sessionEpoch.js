/**
 * sessionEpoch.js
 * A cheap, DB-free session revocation mechanism. Every issued JWT
 * embeds the current epoch. Bumping the epoch (e.g. via "log out
 * everywhere") instantly invalidates every previously issued token,
 * including the one making the revoke request — everyone has to log
 * back in. No token blacklist/session table needed.
 */
const fs = require("fs");
const path = require("path");

const epochPath = path.join(__dirname, "..", "data", "admin-session.json");

function getEpoch() {
  try {
    const data = JSON.parse(fs.readFileSync(epochPath, "utf-8"));
    return data.epoch || 1;
  } catch {
    return 1;
  }
}

function bumpEpoch() {
  const next = getEpoch() + 1;
  fs.writeFileSync(epochPath, JSON.stringify({ epoch: next }, null, 2));
  return next;
}

module.exports = { getEpoch, bumpEpoch };
