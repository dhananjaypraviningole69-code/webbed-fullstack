/**
 * templates.js — catalog (filter/sort) + template detail modal
 * The Buy Now flow (both card + modal) calls POST /api/checkout, which
 * per your current routes/checkout.js returns:
 *   { success, keyId, orderId, amount, currency, productId, productName }
 * That response is used to open Razorpay's checkout.js widget directly —
 * no changes to checkout.js are needed for this page to work.
 */

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
  const features = [...new Set(allProducts.flatMap((p) => p.features || []))];

  document.getElementById("filter-category").innerHTML = categories
    .map((c) => `<label class="filter-option"><input type="checkbox" class="f-category" value="${c}"> ${c}</label>`)
    .join("");
  document.getElementById("filter-style").innerHTML = styles
    .map((s) => `<label class="filter-option"><input type="checkbox" class="f-style" value="${s}"> ${s}</label>`)
    .join("");
  document.getElementById("filter-features").innerHTML = features
    .map((f) => `<label class="filter-option"><input type="checkbox" class="f-feature" value="${f}"> ${f}</label>`)
    .join("");

  document
    .querySelectorAll(".f-category, .f-style, .f-feature, input[name='budget']")
    .forEach((el) => el.addEventListener("change", renderProducts));
  document.getElementById("sort-select").addEventListener("change", renderProducts);
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
    if (activeFeatures.length && !activeFeatures.every((f) => (p.features || []).includes(f))) return false;
    return true;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case "price-asc": return a.price - b.price;
      case "price-desc": return b.price - a.price;
      case "name-asc": return a.name.localeCompare(b.name);
      case "rating-desc":
      default: return b.rating - a.rating;
    }
  });

  document.getElementById("result-count").textContent =
    `${filtered.length} template${filtered.length === 1 ? "" : "s"}`;

  document.getElementById("products-grid").innerHTML = filtered
    .map((p) => {
      const thumbStyle = p.images && p.images.length
        ? `background-image:url('${p.images[0]}'); background-size:cover; background-position:center;`
        : `background:${p.gradient};`;
      return `
    <div class="product-card" data-id="${p.id}">
      <div class="product-thumb" style="${thumbStyle}">
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
            <div class="price">₹${p.price}</div>
            <div class="rating">★ ${p.rating} (${p.reviewCount})</div>
          </div>
          <button class="buy-btn" data-id="${p.id}">Buy Now</button>
        </div>
      </div>
    </div>`;
    })
    .join("");

  // Card click → open modal. Buy button click → checkout directly,
  // without opening the modal (stopPropagation).
  document.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", () => openModal(card.dataset.id));
  });
  document.querySelectorAll(".buy-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      startCheckout(btn.dataset.id, btn);
    });
  });
}

// ---------------------------------------------------------------
// Modal
// ---------------------------------------------------------------
const overlay = document.getElementById("modal-overlay");
let lastFocusedEl = null;

function openModal(productId) {
  const p = allProducts.find((prod) => prod.id === productId);
  if (!p) return;

  lastFocusedEl = document.activeElement;

  document.getElementById("modal-title").textContent = p.name;
  document.getElementById("modal-description").textContent = p.description || "—";
  document.getElementById("modal-client-need").textContent = p.clientNeed || "—";
  document.getElementById("modal-selling-point").textContent = p.sellingPoint || "—";
  document.getElementById("modal-price").textContent = `₹${p.price}`;
  document.getElementById("modal-buy-btn").dataset.id = p.id;
  document.getElementById("modal-checkout-msg").textContent = "";
  document.getElementById("modal-checkout-msg").className = "checkout-msg";

  document.getElementById("modal-meta-row").innerHTML = `
    <span class="tag">${p.category}</span>
    <span class="tag">${p.style}</span>
    <span class="tag">${p.pageType}${p.pageCount ? ` · ${p.pageCount} page${p.pageCount > 1 ? "s" : ""}` : ""}</span>
  `;

  const specs = p.specs || {};
  const specEntries = [
    ["File size", specs.fileSize],
    ["UI type", specs.uiType],
    ["Budget tier", specs.budget],
    ["Best used for", specs.bestUseFor],
    ["Security rating", specs.securityRating],
    ["Cost", specs.cost !== undefined ? `₹${specs.cost}` : `₹${p.price}`],
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  document.getElementById("modal-specs").innerHTML = specEntries
    .map(([k, v]) => `<div class="spec-item"><div class="k">${k}</div><div class="v">${v}</div></div>`)
    .join("");

  // Gallery: images (fallback to gradient block) + optional video
  const media = [];
  (p.images || []).forEach((url) => media.push({ type: "image", url }));
  if (p.video) media.push({ type: "video", url: p.video });

  const mainEl = document.getElementById("modal-main-media");
  const thumbsEl = document.getElementById("modal-thumbs");

  function showMedia(index) {
    const item = media[index];
    if (!item) {
      mainEl.style.background = p.gradient;
      mainEl.innerHTML = "";
      return;
    }
    mainEl.style.background = "";
    if (item.type === "video") {
      mainEl.innerHTML = `<video src="${item.url}" controls></video>`;
    } else {
      mainEl.innerHTML = "";
      mainEl.style.backgroundImage = `url('${item.url}')`;
      mainEl.style.backgroundSize = "contain";
      mainEl.style.backgroundPosition = "center";
    }
    [...thumbsEl.children].forEach((el, i) => el.classList.toggle("active", i === index));
  }

  if (media.length) {
    thumbsEl.innerHTML = media
      .map(
        (m, i) =>
          `<div class="modal-thumb" style="${m.type === "video" ? "background:#000;" : `background-image:url('${m.url}')`}" data-index="${i}">${m.type === "video" ? "▶" : ""}</div>`
      )
      .join("");
    thumbsEl.querySelectorAll(".modal-thumb").forEach((el) => {
      el.addEventListener("click", () => showMedia(Number(el.dataset.index)));
    });
    showMedia(0);
  } else {
    thumbsEl.innerHTML = "";
    showMedia(-1);
  }

  overlay.classList.add("open");
  document.getElementById("modal-close").focus();
  document.body.style.overflow = "hidden";
}

function closeModal() {
  overlay.classList.remove("open");
  document.body.style.overflow = "";
  if (lastFocusedEl) lastFocusedEl.focus();
}

document.getElementById("modal-close").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
});
document.getElementById("modal-buy-btn").addEventListener("click", (e) => {
  startCheckout(e.target.dataset.id, e.target);
});

// ---------------------------------------------------------------
// Razorpay checkout
// ---------------------------------------------------------------
async function startCheckout(productId, triggerBtn) {
  const originalText = triggerBtn.textContent;
  triggerBtn.disabled = true;
  triggerBtn.textContent = "Loading…";

  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not start checkout.");

    const rzp = new Razorpay({
      key: data.keyId,
      order_id: data.orderId,
      amount: data.amount,
      currency: data.currency,
      name: "Webbed",
      description: data.productName,
      handler(response) {
        verifyPayment(response);
      },
      modal: {
        ondismiss() {
          triggerBtn.disabled = false;
          triggerBtn.textContent = originalText;
        },
      },
      theme: { color: "#6A38F1" },
    });
    rzp.open();
  } catch (err) {
    console.error("Checkout error:", err);
    const msgEl = document.getElementById("modal-checkout-msg");
    if (msgEl) {
      msgEl.textContent = err.message;
      msgEl.classList.add("error");
    }
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalText;
  }
}

async function verifyPayment(response) {
  try {
    const res = await fetch("/api/checkout/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Payment verification failed.");

    // Use the one-time download token immediately — it's short-lived,
    // so we trigger the download right away rather than making the
    // buyer track down a link later.
    if (data.downloadToken) {
      const downloadUrl = `/api/download/${data.productId}?token=${data.downloadToken}`;
      window.location.href = downloadUrl;
      alert(`Payment verified! Your download for "${data.productName}" should start automatically. This link is single-use — if it doesn't start, contact support with your payment ID.`);
    } else {
      alert("Payment verified! Check your email for download access.");
    }
  } catch (err) {
    console.error("Verification error:", err);
    alert("Payment was received but verification failed — contact support with your payment ID.");
  }
}

loadProducts();
