/**
 * admin.js — Webbed admin dashboard
 * Handles login (password + TOTP + CAPTCHA), session check, CSRF token
 * handling, and full CRUD + media upload for templates.
 */

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");

// CSRF token, read from the (non-httpOnly) csrf_token cookie set at
// login. Sent as a header on every mutating request — see fetchWithCsrf().
function getCsrfCookie() {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Wrapper around fetch() that automatically attaches the CSRF header
 * for any non-GET request. Use this for every admin API call.
 */
function fetchWithCsrf(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (method !== "GET") {
    const token = getCsrfCookie();
    if (token) headers["X-CSRF-Token"] = token;
  }
  return fetch(url, { ...options, headers, credentials: "include" });
}

// ---------------------------------------------------------------
// Session check on load
// ---------------------------------------------------------------
async function checkSession() {
  try {
    const res = await fetch("/api/admin/session", { credentials: "include" });
    const data = await res.json();
    if (data.authenticated) {
      showDashboard();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  loadTemplates();
}

// ---------------------------------------------------------------
// Login / logout / revoke-all
// ---------------------------------------------------------------
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const btnText = document.getElementById("login-btn-text");
  const msg = document.getElementById("login-msg");
  const formData = new FormData(e.target);
  const payload = Object.fromEntries(formData);

  if (window.turnstile) {
    payload.turnstileToken = window.turnstile.getResponse() || "";
  }

  btn.disabled = true;
  btnText.innerHTML = '<span class="spinner"></span> Signing in…';
  msg.className = "form-msg";

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed.");
    showDashboard();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error", "visible");
  } finally {
    btn.disabled = false;
    btnText.textContent = "Log in";
    if (window.turnstile) window.turnstile.reset();
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetchWithCsrf("/api/admin/logout", { method: "POST" });
  showLogin();
});

document.getElementById("revoke-btn").addEventListener("click", async () => {
  if (!confirm("This logs out every active session, including this one. Continue?")) return;
  await fetchWithCsrf("/api/admin/revoke-sessions", { method: "POST" });
  showLogin();
});

// ---------------------------------------------------------------
// Create new template
// ---------------------------------------------------------------
document.getElementById("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("create-msg");
  const formData = new FormData(e.target);
  const payload = Object.fromEntries(formData);
  payload.pageCount = Number(payload.pageCount);
  payload.price = Number(payload.price);

  msg.className = "form-msg";
  try {
    const res = await fetchWithCsrf("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not create template.");
    msg.textContent = "Template created.";
    msg.classList.add("success", "visible");
    e.target.reset();
    loadTemplates();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("error", "visible");
  }
});

// ---------------------------------------------------------------
// Load + render existing templates
// ---------------------------------------------------------------
async function loadTemplates() {
  const res = await fetch("/api/products");
  const products = await res.json();
  const list = document.getElementById("templates-list");
  list.innerHTML = products.map(renderTemplateCard).join("");
  products.forEach((p) => wireTemplateCard(p.id, p.name));
}

function renderTemplateCard(p) {
  const images = (p.images || [])
    .map(
      (url) => `
      <div class="media-thumb" style="background-image:url('${url}')">
        <button type="button" class="remove-image-btn" data-id="${p.id}" data-url="${url}">×</button>
      </div>`
    )
    .join("");

  const videoBlock = p.video
    ? `<div class="media-count">Video: ${p.video} <button type="button" class="btn-danger remove-video-btn" data-id="${p.id}" style="margin-left:8px;padding:4px 10px;">Remove</button></div>`
    : `<div class="media-count">No video uploaded (optional, max 1)</div>`;

  return `
  <details class="admin-card">
    <summary>${p.name} <span class="chip">₹${p.price} · ${p.pageType}</span></summary>
    <div class="body">
      <form class="edit-form" data-id="${p.id}">
        <div class="admin-grid">
          <div class="field"><label>Name</label><input name="name" value="${escapeAttr(p.name)}"></div>
          <div class="field"><label>Category</label><input name="category" value="${escapeAttr(p.category)}"></div>
          <div class="field"><label>Style</label><input name="style" value="${escapeAttr(p.style)}"></div>
          <div class="field">
            <label>Page type</label>
            <select name="pageType">
              <option value="Landing page" ${p.pageType === "Landing page" ? "selected" : ""}>Landing page</option>
              <option value="Multipage" ${p.pageType === "Multipage" ? "selected" : ""}>Multipage</option>
            </select>
          </div>
          <div class="field"><label>Page count</label><input type="number" name="pageCount" min="1" value="${p.pageCount || 1}"></div>
          <div class="field"><label>Price (₹)</label><input type="number" name="price" min="0" value="${p.price}"></div>
          <div class="field">
            <label>Price tier</label>
            <select name="priceTier">
              <option value="budget" ${p.priceTier === "budget" ? "selected" : ""}>Budget</option>
              <option value="premium" ${p.priceTier === "premium" ? "selected" : ""}>Premium</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Description</label><textarea name="description">${escapeText(p.description)}</textarea></div>
        <div class="field"><label>What the client needs</label><textarea name="clientNeed">${escapeText(p.clientNeed)}</textarea></div>
        <div class="field"><label>Why it sells</label><textarea name="sellingPoint">${escapeText(p.sellingPoint)}</textarea></div>

        <label class="label" style="display:block; margin-top:16px; font-size:0.82rem; color:rgba(233,213,255,0.6);">
          Images (${(p.images || []).length}/5)
        </label>
        <div class="media-row">${images}</div>
        <label class="upload-label">
          + Upload image
          <input type="file" class="image-upload-input" data-id="${p.id}" accept="image/jpeg,image/png,image/webp">
        </label>

        <label class="label" style="display:block; margin-top:16px; font-size:0.82rem; color:rgba(233,213,255,0.6);">Video (0/1)</label>
        ${videoBlock}
        <label class="upload-label">
          + Upload video
          <input type="file" class="video-upload-input" data-id="${p.id}" accept="video/mp4,video/webm">
        </label>

        <div class="admin-actions">
          <button type="submit" class="btn-save">Save changes</button>
          <button type="button" class="btn-danger delete-btn" data-id="${p.id}" data-name="${escapeAttr(p.name)}">Delete template</button>
        </div>
        <div class="form-msg" data-msg-for="${p.id}" role="status" aria-live="polite"></div>
      </form>
    </div>
  </details>`;
}

function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;");
}
function escapeText(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function wireTemplateCard(id, name) {
  const form = document.querySelector(`.edit-form[data-id="${id}"]`);
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = form.querySelector(`[data-msg-for="${id}"]`);
    const payload = Object.fromEntries(new FormData(form));
    payload.pageCount = Number(payload.pageCount);
    payload.price = Number(payload.price);

    msg.className = "form-msg";
    try {
      const res = await fetchWithCsrf(`/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      msg.textContent = "Saved.";
      msg.classList.add("success", "visible");
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add("error", "visible");
    }
  });

  form.querySelector(".delete-btn").addEventListener("click", async () => {
    const typed = prompt(
      `This permanently deletes "${name}" and its uploaded media. Type the exact template name to confirm:`
    );
    if (typed === null) return; // cancelled
    if (typed !== name) {
      alert("Name didn't match — deletion cancelled.");
      return;
    }
    const res = await fetchWithCsrf(`/api/admin/products/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: typed }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Delete failed.");
      return;
    }
    loadTemplates();
  });

  form.querySelector(".image-upload-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetchWithCsrf(`/api/admin/products/${id}/images`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Upload failed.");
      return;
    }
    loadTemplates();
  });

  const videoInput = form.querySelector(".video-upload-input");
  if (videoInput) {
    videoInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("video", file);
      const res = await fetchWithCsrf(`/api/admin/products/${id}/video`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Upload failed.");
        return;
      }
      loadTemplates();
    });
  }
}

document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("remove-image-btn")) {
    const { id, url } = e.target.dataset;
    await fetchWithCsrf(`/api/admin/products/${id}/images`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    loadTemplates();
  }
  if (e.target.classList.contains("remove-video-btn")) {
    const { id } = e.target.dataset;
    await fetchWithCsrf(`/api/admin/products/${id}/video`, { method: "DELETE" });
    loadTemplates();
  }
});

checkSession();
