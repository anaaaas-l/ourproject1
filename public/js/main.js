const categorySelect = document.getElementById("categorySelect");
const filterCategory = document.getElementById("filterCategory");
const resourcesList = document.getElementById("resourcesList");
const uploadForm = document.getElementById("uploadForm");
const searchInput = document.getElementById("searchInput");
const authButtons = document.getElementById("authButtons");
const userActions = document.getElementById("userActions");
const adminLink = document.getElementById("adminLink");
const welcomeText = document.getElementById("welcomeText");
const messageBox = document.getElementById("messageBox");

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
  } else {
    authButtons.classList.remove("hidden");
    userActions.classList.add("hidden");
    adminLink.classList.add("hidden");
  }
}

function logout() {
  clearSession();
  window.location.href = "/pages/accueil.html";
}

async function loadCategories() {
  const categories = await apiRequest("/categories");
  categorySelect.innerHTML = `<option value="">Choisir...</option>`;
  filterCategory.innerHTML = `<option value="">Toutes les catégories</option>`;

  categories.forEach((cat) => {
    categorySelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
    filterCategory.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
  });
}

function resourceCard(resource) {
  return `
    <div class="col-md-6 col-lg-4">
      <div class="card resource-card h-100 shadow-sm">
        <div class="card-body">
          <h5 class="card-title">${resource.title}</h5>
          <p class="mb-1"><i class="fa-solid fa-layer-group"></i> ${resource.category_name}</p>
          <p class="mb-1"><i class="fa-solid fa-user"></i> ${resource.uploader_name}</p>
          <p class="mb-1"><i class="fa-solid fa-download"></i> ${resource.download_count} téléchargements</p>
          <p class="mb-3"><i class="fa-solid fa-heart text-danger"></i> ${resource.like_count} likes</p>
          <div class="d-flex gap-2">
            <a class="btn btn-primary btn-sm" href="/api/resources/${resource.id}/download">
              <i class="fa-solid fa-file-arrow-down"></i> Télécharger
            </a>
            <button class="btn btn-outline-danger btn-sm" onclick="likeResource(${resource.id})">
              <i class="fa-solid fa-heart"></i> Like
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadResources() {
  const search = searchInput.value.trim();
  const categoryId = filterCategory.value;
  const query = new URLSearchParams({ search, categoryId });
  const resources = await apiRequest(`/resources?${query.toString()}`);

  if (resources.length === 0) {
    resourcesList.innerHTML = `<p class="text-muted">Aucune ressource trouvée.</p>`;
    return;
  }

  resourcesList.innerHTML = resources.map(resourceCard).join("");
}

async function likeResource(id) {
  try {
    await apiRequest(`/resources/${id}/like`, "POST");
    showMessage("Merci pour votre like.", "success");
    loadResources();
  } catch (error) {
    showMessage(error.message, "danger");
  }
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const user = getCurrentUser();
    if (!user) {
      showMessage("Connectez-vous pour envoyer un document.", "warning");
      return;
    }

    const formData = new FormData(uploadForm);
    await apiRequest("/resources", "POST", formData, true);
    uploadForm.reset();
    showMessage("Document envoyé avec succès (en attente de validation).", "success");
  } catch (error) {
    showMessage(error.message, "danger");
  }
});

searchInput.addEventListener("input", loadResources);
filterCategory.addEventListener("change", loadResources);

document.getElementById("logoutBtn").addEventListener("click", logout);

async function init() {
  updateNavbar();
  try {
    await loadCategories();
    await loadResources();
  } catch (error) {
    showMessage(error.message, "danger");
  }
}

init();
