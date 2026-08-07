/**
 * main.js — Webbed homepage
 * Product catalog + checkout now live in templates.js (templates.html).
 * This file only handles: hero typing effect, reviews, contact form.
 */

// ---------------------------------------------------------------
// Terminal typing effect (hero)
// ---------------------------------------------------------------
(function typedLine() {
  const el = document.getElementById("typed-line");
  if (!el) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lines = [
    "> browse premium templates",
    "> deploy in minutes, not months",
    "> built by developers, for developers",
  ];
  if (prefersReducedMotion) return;

  let lineIndex = 0;
  let charIndex = lines[0].length;
  let deleting = false;

  function tick() {
    const current = lines[lineIndex];
    if (!deleting) {
      charIndex++;
      if (charIndex > current.length) {
        deleting = true;
        setTimeout(tick, 1800);
        return;
      }
    } else {
      charIndex--;
      if (charIndex < 2) {
        deleting = false;
        lineIndex = (lineIndex + 1) % lines.length;
        el.textContent = lines[lineIndex].slice(0, 2);
        charIndex = 2;
        setTimeout(tick, 400);
        return;
      }
    }
    el.textContent = current.slice(0, charIndex);
    setTimeout(tick, deleting ? 35 : 55);
  }
  charIndex = lines[0].length;
  el.textContent = lines[0];
  setTimeout(tick, 1800);
})();

// ---------------------------------------------------------------
// Reviews: fetch + render + submit
// ---------------------------------------------------------------
let allProductsForReviewSelect = [];

async function loadProductOptionsForReviewForm() {
  try {
    const res = await fetch("/api/products");
    allProductsForReviewSelect = await res.json();
    const select = document.getElementById("review-product");
    if (select) {
      select.innerHTML = allProductsForReviewSelect
        .map((p) => `<option value="${p.id}">${p.name}</option>`)
        .join("");
    }
  } catch (err) {
    console.error("Failed to load products for review form:", err);
  }
}

async function loadReviews() {
  try {
    const res = await fetch("/api/reviews");
    const reviews = await res.json();
    renderReviews(reviews);
  } catch (err) {
    console.error("Failed to load reviews:", err);
    document.getElementById("reviews-list").innerHTML =
      '<p class="mono" style="font-size:0.85rem;">Could not load reviews.</p>';
  }
}

function renderReviews(reviews) {
  const list = document.getElementById("reviews-list");
  if (!reviews.length) {
    list.innerHTML = '<p class="mono" style="font-size:0.85rem;">No reviews yet — be the first.</p>';
    return;
  }
  list.innerHTML = reviews
    .map((r) => {
      const productName =
        allProductsForReviewSelect.find((p) => p.id === r.productId)?.name || r.productId;
      return `
      <div class="review-card">
        <div class="review-top">
          <span class="review-name">${escapeHtml(r.name)}</span>
          <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        </div>
        <div class="review-product mono">re: ${escapeHtml(productName)}</div>
        <p class="review-text">${escapeHtml(r.text)}</p>
        <div class="review-date">${r.date}</div>
      </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const reviewForm = document.getElementById("review-form");
if (reviewForm) {
  reviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("review-submit-btn");
    const btnText = document.getElementById("review-btn-text");
    const msg = document.getElementById("review-msg");

    const formData = new FormData(reviewForm);
    const payload = Object.fromEntries(formData.entries());

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span> Submitting…';
    msg.className = "form-msg";

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit review.");

      msg.textContent = "Thanks — your review is live below.";
      msg.classList.add("success", "visible");
      reviewForm.reset();
      loadReviews();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add("error", "visible");
    } finally {
      btn.disabled = false;
      btnText.textContent = "Submit review";
    }
  });
}

// ---------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------
const contactForm = document.getElementById("contact-form");
if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("contact-submit-btn");
    const btnText = document.getElementById("contact-btn-text");
    const msg = document.getElementById("contact-msg");

    const formData = new FormData(contactForm);
    const payload = Object.fromEntries(formData.entries());

    if (window.turnstile) {
      payload.turnstileToken = window.turnstile.getResponse() || "";
    }

    btn.disabled = true;
    btnText.innerHTML = '<span class="spinner"></span> Sending…';
    msg.className = "form-msg";

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send message.");

      msg.textContent = "Message sent — we'll get back to you soon.";
      msg.classList.add("success", "visible");
      contactForm.reset();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add("error", "visible");
    } finally {
      btn.disabled = false;
      btnText.textContent = "Send message";
      if (window.turnstile) window.turnstile.reset();
    }
  });
}

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
(async function init() {
  await loadProductOptionsForReviewForm();
  await loadReviews();
})();
