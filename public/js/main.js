const authButtons = document.getElementById("authButtons");
const userActions = document.getElementById("userActions");
const adminLink = document.getElementById("adminLink");
const welcomeText = document.getElementById("welcomeText");
const messageBox = document.getElementById("messageBox");
const studentPeerSection = document.getElementById("studentPeerSection");
const studentShareForm = document.getElementById("studentShareForm");
const studentPublicDocsList = document.getElementById("studentPublicDocsList");
const peerSearchInput = document.getElementById("peerSearchInput");
const peerSearchBtn = document.getElementById("peerSearchBtn");
const peerCategorySelect = document.getElementById("peerCategorySelect");
const peerFilterCategory = document.getElementById("peerFilterCategory");
const studentShareCodeBanner = document.getElementById("studentShareCodeBanner");
const privateDocCodeInput = document.getElementById("privateDocCodeInput");
const privateDocResolveBtn = document.getElementById("privateDocResolveBtn");
const privateDocResolved = document.getElementById("privateDocResolved");
const privateDocResolvedTitle = document.getElementById("privateDocResolvedTitle");
const privateDocResolvedMeta = document.getElementById("privateDocResolvedMeta");
const privateDocDownloadBtn = document.getElementById("privateDocDownloadBtn");

let resolvedPrivateDoc = null;

function showMessage(message, type = "info") {
  messageBox.className = `alert alert-${type}`;
  messageBox.textContent = message;
  messageBox.classList.remove("hidden");
  setTimeout(() => messageBox.classList.add("hidden"), 3000);
}

function updateNavbar() {
  const user = getCurrentUser();
  if (user) {
    authButtons.classList.add("hidden");
    userActions.classList.remove("hidden");
    welcomeText.textContent = `Bonjour, ${user.name}`;
    if (user.role === "admin") {
      adminLink.classList.remove("hidden");
    }
    if (studentPeerSection) {
      if (user.role === "student") {
        studentPeerSection.classList.remove("hidden");
      } else {
        studentPeerSection.classList.add("hidden");
      }
    }
  } else {
    authButtons.classList.remove("hidden");
    userActions.classList.add("hidden");
    adminLink.classList.add("hidden");
    if (studentPeerSection) {
      studentPeerSection.classList.add("hidden");
    }
  }
}

function logout() {
  clearSession();
  window.location.href = "/pages/accueil.html";
}

function isPdfFileName(name) {
  return String(name || "").toLowerCase().endsWith(".pdf");
}

function formatDateFr(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadPeerCategories() {
  try {
    const cats = await apiRequest("/categories");
    const opts = cats
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
      .join("");
    if (peerCategorySelect) {
      peerCategorySelect.innerHTML = `<option value="">Choisir…</option>${opts}`;
    }
    if (peerFilterCategory) {
      peerFilterCategory.innerHTML = `<option value="">Toutes les catégories</option>${opts}`;
    }
  } catch (e) {
    if (peerCategorySelect) peerCategorySelect.innerHTML = `<option value="">${escapeHtml(e.message)}</option>`;
  }
}

async function loadStudentPublicDocs() {
  if (!studentPublicDocsList) return;
  const user = getCurrentUser();
  if (!user || user.role !== "student") return;

  try {
    const q = new URLSearchParams();
    const peerSearch = peerSearchInput ? peerSearchInput.value.trim() : "";
    const categoryId = peerFilterCategory ? peerFilterCategory.value : "";
    if (peerSearch) q.set("search", peerSearch);
    if (categoryId) q.set("categoryId", categoryId);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const docs = await apiRequest(`/student-documents${suffix}`);
    if (docs.length === 0) {
      const hasFilter = Boolean(peerSearch || categoryId);
      studentPublicDocsList.innerHTML = hasFilter
        ? '<p class="text-muted small mb-0">Aucun document public ne correspond à votre recherche.</p>'
        : '<p class="text-muted small mb-0">Aucun document public pour le moment.</p>';
      return;
    }
    studentPublicDocsList.innerHTML = docs
      .map(
        (d) => `
      <div class="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <span class="fw-medium">${escapeHtml(d.title)}</span>
          <span class="text-muted small d-block">${escapeHtml(d.file_name || "")}</span>
          <span class="text-muted small"><i class="fa-solid fa-layer-group"></i> ${escapeHtml(d.category_name || "—")}</span>
          <span class="text-muted small d-block">${escapeHtml(d.uploader_name)} · ${escapeHtml(formatDateFr(d.created_at))}</span>
        </div>
        <div class="d-flex gap-1 flex-shrink-0">
          ${
            isPdfFileName(d.file_name)
              ? `<button type="button" class="btn btn-sm btn-outline-primary student-peer-pdf-view" data-id="${d.id}" title="Voir le PDF"><i class="fa-solid fa-eye"></i></button>`
              : ""
          }
          <button type="button" class="btn btn-sm btn-outline-primary student-peer-dl" data-id="${d.id}" title="Télécharger">
            <i class="fa-solid fa-download"></i>
          </button>
        </div>
      </div>`
      )
      .join("");
    studentPublicDocsList.querySelectorAll(".student-peer-dl").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        try {
          await authorizedDownload(`/student-documents/${id}/download`);
          showMessage("Téléchargement lancé.", "success");
        } catch (e) {
          showMessage(e.message, "danger");
        }
      });
    });
    studentPublicDocsList.querySelectorAll(".student-peer-pdf-view").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        try {
          await authorizedPdfOpen(`/student-documents/${id}/view`);
        } catch (e) {
          showMessage(e.message, "danger");
        }
      });
    });
  } catch (e) {
    studentPublicDocsList.innerHTML = `<p class="text-danger small">${e.message}</p>`;
  }
}

if (peerFilterCategory) {
  peerFilterCategory.addEventListener("change", () => loadStudentPublicDocs());
}

if (peerSearchBtn) {
  peerSearchBtn.addEventListener("click", () => loadStudentPublicDocs());
}

if (peerSearchInput) {
  peerSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadStudentPublicDocs();
    }
  });
}

document.getElementById("logoutBtn").addEventListener("click", logout);

if (studentShareForm) {
  studentShareForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const user = getCurrentUser();
    if (!user || user.role !== "student") {
      showMessage("Connectez-vous en tant qu’étudiant.", "warning");
      return;
    }
    try {
      const formData = new FormData(studentShareForm);
      const res = await apiRequest("/student-documents", "POST", formData, true);
      studentShareForm.reset();
      studentShareCodeBanner.classList.add("hidden");
      if (res.document && res.document.accessCode) {
        studentShareCodeBanner.className = "alert alert-warning mb-3";
        studentShareCodeBanner.innerHTML = `<strong>Code d’accès privé :</strong> <code class="user-select-all fs-5">${res.document.accessCode}</code><br /><span class="small">Conservez ce code : il permet aux autres étudiants d’accéder au fichier après connexion.</span>`;
        studentShareCodeBanner.classList.remove("hidden");
      }
      showMessage(res.message || "Document enregistré.", "success");
      await loadStudentPublicDocs();
    } catch (error) {
      showMessage(error.message, "danger");
    }
  });
}

function hidePrivateResolved() {
  resolvedPrivateDoc = null;
  if (privateDocResolved) privateDocResolved.classList.add("hidden");
}

if (privateDocResolveBtn && privateDocCodeInput) {
  privateDocResolveBtn.addEventListener("click", async () => {
    const user = getCurrentUser();
    if (!user || user.role !== "student") {
      showMessage("Connectez-vous en tant qu’étudiant.", "warning");
      return;
    }
    const code = privateDocCodeInput.value.trim();
    if (!code) {
      showMessage("Saisissez un code.", "warning");
      return;
    }
    try {
      const doc = await apiRequest(`/student-documents/private/resolve?code=${encodeURIComponent(code)}`);
      resolvedPrivateDoc = { id: doc.id, code };
      privateDocResolvedTitle.textContent = doc.title;
      privateDocResolvedMeta.textContent = [
        doc.uploader_name,
        doc.category_name ? `Catégorie : ${doc.category_name}` : null,
        formatDateFr(doc.created_at),
      ]
        .filter(Boolean)
        .join(" · ");
      privateDocResolved.classList.remove("hidden");
      showMessage("Code reconnu. Vous pouvez télécharger le document.", "success");
    } catch (error) {
      hidePrivateResolved();
      showMessage(error.message, "danger");
    }
  });
}

if (privateDocDownloadBtn) {
  privateDocDownloadBtn.addEventListener("click", async () => {
    if (!resolvedPrivateDoc) return;
    try {
      await authorizedDownload(
        `/student-documents/${resolvedPrivateDoc.id}/download?code=${encodeURIComponent(resolvedPrivateDoc.code)}`
      );
      showMessage("Téléchargement lancé.", "success");
    } catch (error) {
      showMessage(error.message, "danger");
    }
  });
}

async function init() {
  updateNavbar();
  try {
    await loadPeerCategories();
    await loadStudentPublicDocs();
  } catch (error) {
    showMessage(error.message, "danger");
  }
}

init();
