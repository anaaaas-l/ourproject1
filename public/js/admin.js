const statsContainer = document.getElementById("statsContainer");
const pendingList = document.getElementById("pendingList");
const pendingStudentsList = document.getElementById("pendingStudentsList");
const categoriesList = document.getElementById("categoriesList");
const addCategoryForm = document.getElementById("addCategoryForm");
const adminMessage = document.getElementById("adminMessage");

function showAdminMessage(message, type = "info") {
  adminMessage.className = `alert alert-${type}`;
  adminMessage.textContent = message;
  adminMessage.classList.remove("hidden");
  setTimeout(() => adminMessage.classList.add("hidden"), 3000);
}

async function loadStats() {
  const stats = await apiRequest("/admin/stats");
  statsContainer.innerHTML = `
    <div class="col-md-6">
      <div class="card shadow-sm">
        <div class="card-body">
          <h5><i class="fa-solid fa-file"></i> Total fichiers</h5>
          <p class="display-6">${stats.totalFiles}</p>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card shadow-sm">
        <div class="card-body">
          <h5><i class="fa-solid fa-download"></i> Total téléchargements</h5>
          <p class="display-6">${stats.totalDownloads}</p>
        </div>
      </div>
    </div>
  `;
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
            <strong>${student.name}</strong><br />
            <small>${student.email}</small>
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

async function loadPendingResources() {
  const resources = await apiRequest("/resources/pending");
  if (resources.length === 0) {
    pendingList.innerHTML = "<p class='text-muted'>Aucun document en attente.</p>";
    return;
  }

  pendingList.innerHTML = resources
    .map(
      (r) => `
    <div class="card mb-2">
      <div class="card-body d-flex justify-content-between align-items-center">
        <div>
          <strong>${r.title}</strong> - ${r.category_name}<br />
          <small>Par ${r.uploader_name}</small>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-success btn-sm" onclick="approveResource(${r.id})">
            <i class="fa-solid fa-check"></i> Approuver
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteResource(${r.id})">
            <i class="fa-solid fa-trash"></i> Supprimer
          </button>
        </div>
      </div>
    </div>`
    )
    .join("");
}

async function approveStudent(id) {
  try {
    await apiRequest(`/admin/students/${id}/approve`, "PATCH");
    showAdminMessage("Compte étudiant approuvé.", "success");
    loadPendingStudents();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

async function loadCategories() {
  const categories = await apiRequest("/categories");
  categoriesList.innerHTML = categories
    .map(
      (cat) => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      ${cat.name}
      <button class="btn btn-outline-danger btn-sm" onclick="deleteCategory(${cat.id})">
        <i class="fa-solid fa-trash"></i>
      </button>
    </li>`
    )
    .join("");
}

async function approveResource(id) {
  try {
    await apiRequest(`/admin/resources/${id}/approve`, "PATCH");
    showAdminMessage("Ressource approuvée.", "success");
    loadPendingResources();
    loadStats();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

async function deleteResource(id) {
  try {
    await apiRequest(`/resources/${id}`, "DELETE");
    showAdminMessage("Ressource supprimée.", "success");
    loadPendingResources();
    loadStats();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

async function deleteCategory(id) {
  try {
    await apiRequest(`/categories/${id}`, "DELETE");
    showAdminMessage("Catégorie supprimée.", "success");
    loadCategories();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

addCategoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("categoryName").value.trim();
  try {
    await apiRequest("/categories", "POST", { name });
    addCategoryForm.reset();
    showAdminMessage("Catégorie ajoutée.", "success");
    loadCategories();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
});

function ensureAdmin() {
  const user = getCurrentUser();
  if (!user || user.role !== "admin") {
    window.location.href = "/";
  }
}

async function initAdmin() {
  ensureAdmin();
  try {
    await loadStats();
    await loadPendingStudents();
    await loadPendingResources();
    await loadCategories();
  } catch (error) {
    showAdminMessage(error.message, "danger");
  }
}

initAdmin();
