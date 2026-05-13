const pendingStudentsList = document.getElementById("pendingStudentsList");
const allStudentsList = document.getElementById("allStudentsList");
const adminStudentDocsList = document.getElementById("adminStudentDocsList");
const categoriesList = document.getElementById("categoriesList");
const addCategoryForm = document.getElementById("addCategoryForm");
const adminMessage = document.getElementById("adminMessage");

function showAdminMessage(message, type = "info") {
  adminMessage.className = `alert alert-${type}`;
  adminMessage.textContent = message;
  adminMessage.classList.remove("hidden");
  setTimeout(() => adminMessage.classList.add("hidden"), 3000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isPdfFileName(name) {
  return String(name || "").toLowerCase().endsWith(".pdf");
}

async function loadPendingStudents() {
  const students = await apiRequest("/admin/students/pending");
  if (students.length === 0) {
    pendingStudentsList.innerHTML = "<p class='text-muted text-center py-3'>Aucun compte étudiant en attente.</p>";
    return;
  }

  pendingStudentsList.innerHTML = students
    .map(
      (student) => `
      <div class="document-card mb-3">
        <div class="d-flex align-items-center gap-3">
          <div class="document-icon">
            <i class="fa-solid fa-user-clock"></i>
          </div>
          <div class="flex-grow-1">
            <h6 class="fw-bold mb-1">${escapeHtml(student.name)}</h6>
            <p class="text-muted small mb-0"><i class="fa-solid fa-envelope me-2"></i>${escapeHtml(student.email)}</p>
          </div>
          <button class="btn btn-success" onclick="approveStudent(${student.id})">
            <i class="fa-solid fa-check me-2"></i>Approuver
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

async function loadAllStudents() {
  const students = await apiRequest("/admin/students");
  if (students.length === 0) {
    allStudentsList.innerHTML = "<p class='text-muted text-center py-3'>Aucun étudiant enregistré.</p>";
    return;
  }

  allStudentsList.innerHTML = `
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead>
          <tr style="background: linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%);">
            <th class="fw-bold">Nom</th>
            <th class="fw-bold">Email</th>
            <th class="fw-bold">Statut</th>
            <th class="text-end fw-bold">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${students
            .map(
              (s) => `
            <tr>
              <td><strong>${escapeHtml(s.name)}</strong></td>
              <td>${escapeHtml(s.email)}</td>
              <td><span class="badge bg-light text-primary fw-medium">${escapeHtml(s.account_status || "—")}</span></td>
              <td class="text-end">
                <button type="button" class="btn btn-outline-danger" onclick="deleteStudent(${s.id}, this)">
                  <i class="fa-solid fa-trash me-2"></i>Supprimer
                </button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

async function deleteStudent(id, btn) {
  if (!window.confirm("Supprimer définitivement cet étudiant et ses documents associés ?")) return;
  if (btn) btn.disabled = true;
  try {
    await apiRequest(`/admin/students/${id}`, "DELETE");
    showAdminMessage("Étudiant supprimé.", "success");
    await loadAllStudents();
    await loadAdminStudentDocuments();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.deleteStudent = deleteStudent;

async function loadAdminStudentDocuments() {
  const docs = await apiRequest("/admin/student-documents");
  if (docs.length === 0) {
    adminStudentDocsList.innerHTML = "<p class='text-muted text-center py-3'>Aucun document partagé pour le moment.</p>";
    return;
  }

  adminStudentDocsList.innerHTML = `
    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead>
          <tr style="background: linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%);">
            <th class="fw-bold">Titre</th>
            <th class="fw-bold">Fichier</th>
            <th class="fw-bold">Visibilité</th>
            <th class="fw-bold">Déposé par</th>
            <th class="fw-bold">Catégorie</th>
            <th class="fw-bold">Date</th>
            <th class="text-end fw-bold">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${docs
            .map((d) => {
              const badge =
                d.visibility === "private"
                  ? '<span class="badge bg-warning text-dark fw-medium"><i class="fa-solid fa-lock me-1"></i>Privé</span>'
                  : '<span class="badge bg-success text-white fw-medium"><i class="fa-solid fa-globe me-1"></i>Public</span>';
              const codeCell =
                d.visibility === "private" && d.access_code
                  ? `<br /><small class="text-muted">Code : <code class="user-select-all">${escapeHtml(d.access_code)}</code></small>`
                  : "";
              const pdf = isPdfFileName(d.file_name);
              return `
            <tr>
              <td><strong>${escapeHtml(d.title)}</strong>${codeCell}</td>
              <td>${escapeHtml(d.file_name)}</td>
              <td>${badge}</td>
              <td>${escapeHtml(d.uploader_name)}<br /><small class="text-muted">${escapeHtml(d.uploader_email || "")}</small></td>
              <td><span class="badge bg-light text-primary fw-medium">${escapeHtml(d.category_name || "—")}</span></td>
              <td><small>${escapeHtml(String(d.created_at || "").slice(0, 16).replace("T", " "))}</small></td>
              <td class="text-end text-nowrap">
                ${
                  pdf
                    ? `<button type="button" class="btn btn-outline-primary me-2" onclick="adminOpenStudentDocPdf(${d.id})">
                    <i class="fa-regular fa-file-pdf me-1"></i>Ouvrir
                  </button>`
                    : ""
                }
                <button type="button" class="btn btn-outline-secondary me-2" onclick="adminDownloadStudentDoc(${d.id})">
                  <i class="fa-solid fa-download me-1"></i>Télécharger
                </button>
                <button type="button" class="btn btn-outline-danger" onclick="adminDeleteStudentDoc(${d.id}, this)">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

async function adminDownloadStudentDoc(id) {
  try {
    await authorizedDownload(`/student-documents/${id}/download`);
    showAdminMessage("Téléchargement lancé.", "success");
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

async function adminOpenStudentDocPdf(id) {
  try {
    await authorizedPdfOpen(`/student-documents/${id}/view`);
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

async function adminDeleteStudentDoc(id, btn) {
  if (!window.confirm("Supprimer définitivement ce document (fichier inclus) ?")) return;
  if (btn) btn.disabled = true;
  try {
    await apiRequest(`/admin/student-documents/${id}`, "DELETE");
    showAdminMessage("Document supprimé.", "success");
    await loadAdminStudentDocuments();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.adminDownloadStudentDoc = adminDownloadStudentDoc;
window.adminOpenStudentDocPdf = adminOpenStudentDocPdf;
window.adminDeleteStudentDoc = adminDeleteStudentDoc;

async function approveStudent(id) {
  try {
    await apiRequest(`/admin/students/${id}/approve`, "PATCH");
    showAdminMessage("Compte étudiant approuvé.", "success");
    await loadPendingStudents();
    await loadAllStudents();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

window.approveStudent = approveStudent;

async function loadCategories() {
  const categories = await apiRequest("/categories");
  if (categories.length === 0) {
    categoriesList.innerHTML = "<p class='text-muted text-center py-3'>Aucune catégorie pour le moment.</p>";
    return;
  }
  categoriesList.innerHTML = `
    <div class="row g-3">
      ${categories
        .map(
          (cat) => `
        <div class="col-md-4">
          <div class="document-card">
            <div class="d-flex align-items-center justify-content-between">
              <div class="d-flex align-items-center gap-3">
                <div class="document-icon">
                  <i class="fa-solid fa-tag"></i>
                </div>
                <span class="fw-bold">${escapeHtml(cat.name)}</span>
              </div>
              <button class="btn btn-outline-danger" onclick="deleteCategory(${cat.id})">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>`
        )
        .join("")}
    </div>`;
}

async function deleteCategory(id) {
  try {
    await apiRequest(`/categories/${id}`, "DELETE");
    showAdminMessage("Catégorie supprimée.", "success");
    await loadCategories();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

window.deleteCategory = deleteCategory;

addCategoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("categoryName").value.trim();
  try {
    await apiRequest("/categories", "POST", { name });
    addCategoryForm.reset();
    showAdminMessage("Catégorie ajoutée.", "success");
    await loadCategories();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
});

const adminLogoutBtn = document.getElementById("adminLogoutBtn");
if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener("click", () => {
    clearSession();
    window.location.href = "/pages/accueil.html";
  });
}

function ensureAdmin() {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    window.location.href = "/";
  }
}

async function initAdmin() {
  ensureAdmin();
  try {
    await loadPendingStudents();
    await loadAllStudents();
    await loadAdminStudentDocuments();
    await loadCategories();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

initAdmin();
