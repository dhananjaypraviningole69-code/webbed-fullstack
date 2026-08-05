/**
 * main.js — Webbed frontend
 * Talks to the Express API: /api/products, /api/reviews, /api/contact, /api/checkout
 */

// ---------------------------------------------------------------
// Terminal typing effect (hero) — purely cosmetic, respects
// prefers-reduced-motion by just showing the first line statically.
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
// Catalog: fetch, filter, sort, render, checkout
// ---------------------------------------------------------------
let allProducts = [];

async function loadProducts() {
  try {
    const res = await fetch("/api/products");
    allProducts = await res.json();
    buildFilterOptions();
    renderProducts();
  } catch (err) {
    console.error("Failed to load products:", err);
    document.getElementById("result-count").textContent = "Could not load templates.";
  }
}

function buildFilterOptions() {
  const categories = [...new Set(allProducts.map((p) => p.category))];
  const styles = [...new Set(allProducts.map((p) => p.style))];
  const features = [...new Set(allProducts.flatMap((p) => p.features))];

  document.getElementById("filter-category").innerHTML = categories
    .map(
      (c) => `<label class="filter-option"><input type="checkbox" class="f-category" value="${c}"> ${c}</label>`
    )
    .join("");

  document.getElementById("filter-style").innerHTML = styles
    .map(
      (s) => `<label class="filter-option"><input type="checkbox" class="f-style" value="${s}"> ${s}</label>`
    )
    .join("");

  document.getElementById("filter-features").innerHTML = features
    .map(
      (f) => `<label class="filter-option"><input type="checkbox" class="f-feature" value="${f}"> ${f}</label>`
    )
    .join("");

  document
    .querySelectorAll(".f-category, .f-style, .f-feature, input[name='budget']")
    .forEach((el) => el.addEventListener("change", renderProducts));
  document.getElementById("sort-select").addEventListener("change", renderProducts);

  // Populate the "which template" select on the review form too
  const reviewSelect = document.getElementById("review-product");
  reviewSelect.innerHTML = allProducts
    .map((p) => `<option value="${p.id}">${p.name}</option>`)
    .join("");
}

function getCheckedValues(selector) {
  return [...document.querySelectorAll(selector + ":checked")].map((el) => el.value);
}

function renderProducts() {
  const activeCategories = getCheckedValues(".f-category");
  const activeStyles = getCheckedValues(".f-style");
  const activeFeatures = getCheckedValues(".f-feature");
  const budget = document.querySelector("input[name='budget']:checked").value;
  const sortBy = document.getElementById("sort-select").value;

  let filtered = allProducts.filter((p) => {
    if (activeCategories.length && !activeCategories.includes(p.category)) return false;
    if (activeStyles.length && !activeStyles.includes(p.style)) return false;
    if (budget !== "all" && p.priceTier !== budget) return false;
    if (activeFeatures.length && !activeFeatures.every((f) => p.features.includes(f))) return false;
    return true;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case "price-asc":
        return a.price - b.price;
      case "price-desc":
        return b.price - a.price;
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "rating-desc":
      default:
        return b.rating - a.rating;
    }
  });

  document.getElementById("result-count").textContent = `${filtered.length} template${
    filtered.length === 1 ? "" : "s"
  }`;

  document.getElementById("products-grid").innerHTML = filtered
    .map(
      (p) => `
    <div class="product-card">
      <div class="product-thumb" style="background:${p.gradient}">
        <span class="badge">${p.pages}</span>
      </div>
      <div class="product-body">
        <h3>${p.name}</h3>
        <div class="product-meta">
          <span class="tag">${p.category}</span>
          <span class="tag">${p.style}</span>
        </div>
        <p class="desc">${p.description}</p>
        <div class="product-footer">
          <div>
            <div class="price">$${p.price}</div>
            <div class="rating">★ ${p.rating} (${p.reviewCount})</div>
          </div>
          <button class="buy-btn" data-id="${p.id}">Buy Now</button>
        </div>
        <div class="checkout-msg" data-id="${p.id}"></div>
      </div>
    </div>
  `
    )
    .join("");

  document.querySelectorAll(".buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleCheckout(btn));
  });
}

async function handleCheckout(btn) {
  const productId = btn.dataset.id;
  const msgEl = document.querySelector(`.checkout-msg[data-id="${productId}"]`);
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Redirecting…";
  msgEl.textContent = "";
  msgEl.className = "checkout-msg";

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Checkout failed.");

    window.location.href = data.url;
  } catch (err) {
    console.error("Checkout error:", err);
    msgEl.textContent = err.message;
    msgEl.classList.add("error");
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ---------------------------------------------------------------
// Reviews: fetch + render + submit
// ---------------------------------------------------------------
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
      const productName = allProducts.find((p) => p.id === r.productId)?.name || r.productId;
      return `
      <div class="review-card">
        <div class="review-top">
          <span class="review-name">${escapeHtml(r.name)}</span>
          <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        </div>
        <div class="review-product mono">re: ${escapeHtml(productName)}</div>
        <p class="review-text">${escapeHtml(r.text)}</p>
        <div class="review-date">${r.date}</div>
      </div>
    `;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const reviewForm = document.getElementById("review-form");
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

// ---------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------
const contactForm = document.getElementById("contact-form");
contactForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("contact-submit-btn");
  const btnText = document.getElementById("contact-btn-text");
  const msg = document.getElementById("contact-msg");

  const formData = new FormData(contactForm);
  const payload = Object.fromEntries(formData.entries());

  // Attach the Turnstile CAPTCHA response token, if the widget loaded.
  // window.turnstile is provided by the Cloudflare script tag in index.html.
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
    // Reset the CAPTCHA widget so a retry gets a fresh token — Turnstile
    // tokens are single-use.
    if (window.turnstile) window.turnstile.reset();
  }
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
(async function init() {
  await loadProducts();
  await loadReviews();
})();
