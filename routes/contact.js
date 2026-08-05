const express = require("express");
const nodemailer = require("nodemailer");
const { body, validationResult } = require("express-validator");

const { contactLimiter } = require("../middleware/rateLimiters");
const { verifyTurnstile } = require("../middleware/verifyTurnstile");

const router = express.Router();

// --- Validation & sanitization ------------------------------------------
// - trim/escape strips leading/trailing whitespace and HTML-escapes
//   input so it can't inject markup if ever reflected/logged/emailed as HTML
// - isEmail + normalizeEmail enforce a real email format
// - length caps double as a spam/abuse control and match the DB/email
//   size limits below
const contactValidators = [
  body("name")
    .trim()
    .escape()
    .isLength({ min: 2, max: 80 })
    .withMessage("Name must be between 2 and 80 characters."),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address.")
    .normalizeEmail(),
  body("message")
    .trim()
    .escape()
    .isLength({ min: 10, max: 1000 })
    .withMessage("Message must be between 10 and 1000 characters."),
  // Optional on the wire so the route still works before CAPTCHA is
  // configured in .env — verifyTurnstile() enforces it once it is.
  body("turnstileToken").optional({ checkFalsy: true }).isString().trim(),
];

// Strips CR/LF so nothing in these values can inject extra email
// headers (classic "email header injection" via \r\n in a form field).
function stripHeaderInjectionChars(value) {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

router.post("/", contactLimiter, contactValidators, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() });
  }

  const { name, email, message, turnstileToken } = req.body;

  const captcha = await verifyTurnstile(turnstileToken, req.ip);
  if (!captcha.success) {
    return res.status(400).json({ error: "CAPTCHA verification failed. Please try again." });
  }

  const safeName = stripHeaderInjectionChars(name);
  const safeEmail = stripHeaderInjectionChars(email);
  const safeMessage = stripHeaderInjectionChars(message);

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.CONTACT_EMAIL_USER,
        pass: process.env.CONTACT_EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Webbed Contact Form" <${process.env.CONTACT_EMAIL_USER}>`,
      to: process.env.CONTACT_EMAIL_TO || process.env.CONTACT_EMAIL_USER,
      replyTo: safeEmail,
      subject: `New inquiry from ${safeName} via Webbed`,
      text: `From: ${safeName} <${safeEmail}>\n\n${safeMessage}`,
    });

    res.json({ success: true });
  } catch (error) {
    // Pass to the centralized handler — it logs the real error and
    // returns a safe generic message to the client.
    error.clientMessage = "Message could not be sent. Please try again.";
    next(error);
  }
});

module.exports = router;
