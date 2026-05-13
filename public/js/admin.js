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
    pendingStudentsList.innerHTML = "<p class='text-muted'>Aucun compte étudiant en attente.</p>";
    return;
  }

  pendingStudentsList.innerHTML = students
    .map(
      (student) => `
      <div class="card mb-2">
        <div class="card-body d-flex justify-content-between align-items-center">
          <div>
            <strong>${escapeHtml(student.name)}</strong><br />
            <small>${escapeHtml(student.email)}</small>
          </div>
          <button class="btn btn-success btn-sm" onclick="approveStudent(${student.id})">
            <i class="fa-solid fa-user-check"></i> Approuver
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
    allStudentsList.innerHTML = "<p class='text-muted'>Aucun étudiant enregistré.</p>";
    return;
  }

  allStudentsList.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-bordered align-middle">
        <thead class="table-light">
          <tr>
            <th>Nom</th>
            <th>Email</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${students
            .map(
              (s) => `
            <tr>
              <td>${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.email)}</td>
              <td><span class="badge text-bg-secondary">${escapeHtml(s.account_status || "—")}</span></td>
              <td class="text-end">
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="deleteStudent(${s.id}, this)">
                  <i class="fa-solid fa-trash"></i> Supprimer
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
    adminStudentDocsList.innerHTML = "<p class='text-muted'>Aucun document partagé pour le moment.</p>";
    return;
  }

  adminStudentDocsList.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-bordered align-middle">
        <thead class="table-light">
          <tr>
            <th>Titre</th>
            <th>Fichier</th>
            <th>Visibilité</th>
            <th>Déposé par</th>
            <th>Catégorie</th>
            <th>Date</th>
            <th class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${docs
            .map((d) => {
              const vis = d.visibility === "private" ? "Privé" : "Public";
              const badge =
                d.visibility === "private"
                  ? '<span class="badge text-bg-warning">Privé</span>'
                  : '<span class="badge text-bg-success">Public</span>';
              const codeCell =
                d.visibility === "private" && d.access_code
                  ? `<br /><small class="text-muted">Code : <code class="user-select-all">${escapeHtml(d.access_code)}</code></small>`
                  : "";
              const pdf = isPdfFileName(d.file_name);
              return `
            <tr>
              <td>${escapeHtml(d.title)}${codeCell}</td>
              <td>${escapeHtml(d.file_name)}</td>
              <td>${badge}<span class="visually-hidden">${vis}</span></td>
              <td>${escapeHtml(d.uploader_name)}<br /><small class="text-muted">${escapeHtml(d.uploader_email || "")}</small></td>
              <td>${escapeHtml(d.category_name || "—")}</td>
              <td><small>${escapeHtml(String(d.created_at || "").slice(0, 16).replace("T", " "))}</small></td>
              <td class="text-end text-nowrap">
                ${
                  pdf
                    ? `<button type="button" class="btn btn-outline-primary btn-sm me-1" onclick="adminOpenStudentDocPdf(${d.id})" title="Ouvrir le PDF">
                    <i class="fa-regular fa-file-pdf"></i>
                  </button>`
                    : ""
                }
                <button type="button" class="btn btn-outline-secondary btn-sm me-1" onclick="adminDownloadStudentDoc(${d.id})" title="Télécharger">
                  <i class="fa-solid fa-download"></i>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" onclick="adminDeleteStudentDoc(${d.id}, this)" title="Supprimer">
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
  categoriesList.innerHTML = categories
    .map(
      (cat) => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      ${escapeHtml(cat.name)}
      <button class="btn btn-outline-danger btn-sm" onclick="deleteCategory(${cat.id})">
        <i class="fa-solid fa-trash"></i>
      </button>
    </li>`
    )
    .join("");
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
