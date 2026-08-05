/**
 * verifyTurnstile.js
 * Verifies a Cloudflare Turnstile token server-side. Used to gate the
 * contact form against bots/spam. Requires Node 18+ for global fetch.
 */

async function verifyTurnstile(token, remoteIp) {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    // CAPTCHA not configured yet — fail closed in production, but allow
    // through in development so local testing isn't blocked.
    if (process.env.NODE_ENV === "production") {
      return { success: false, reason: "captcha_not_configured" };
    }
    return { success: true, reason: "captcha_skipped_dev_mode" };
  }

  if (!token) {
    return { success: false, reason: "missing_token" };
  }

  try {
    const params = new URLSearchParams();
    params.append("secret", process.env.TURNSTILE_SECRET_KEY);
    params.append("response", token);
    if (remoteIp) params.append("remoteip", remoteIp);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: params,
    });
    const data = await res.json();
    return { success: !!data.success, reason: data["error-codes"] };
  } catch (err) {
    console.error("Turnstile verification request failed:", err);
    return { success: false, reason: "verification_request_failed" };
  }
}

module.exports = { verifyTurnstile };
