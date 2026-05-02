const authForm = document.getElementById("authForm");
const authTitle = document.getElementById("authTitle");
const roleDescription = document.getElementById("roleDescription");
const nameGroup = document.getElementById("nameGroup");
const usernameGroup = document.getElementById("usernameGroup");
const emailGroup = document.getElementById("emailGroup");
const emailLabel = document.getElementById("emailLabel");
const emailInput = document.getElementById("email");
const usernameInput = document.getElementById("username");
const switchModeBtn = document.getElementById("switchModeBtn");
const authMessage = document.getElementById("authMessage");
const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const togglePasswordIcon = document.getElementById("togglePasswordIcon");
const academicEmailRegex = /^[^\s@]+@[^\s@]*\.ac\.ma$/i;

let isLoginMode = true;
const selectedRole = new URLSearchParams(window.location.search).get("role") || "student";

if (!["student", "admin"].includes(selectedRole)) {
  window.location.href = "/pages/accueil.html";
}

if (togglePasswordBtn && passwordInput && togglePasswordIcon) {
  togglePasswordBtn.addEventListener("click", () => {
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    togglePasswordIcon.classList.toggle("fa-eye", !show);
    togglePasswordIcon.classList.toggle("fa-eye-slash", show);
    togglePasswordBtn.setAttribute(
      "aria-label",
      show ? "Masquer le mot de passe" : "Afficher le mot de passe"
    );
    togglePasswordBtn.title = show ? "Masquer le mot de passe" : "Afficher le mot de passe";
  });
}

function showAuthMessage(message, type = "danger") {
  authMessage.className = `alert alert-${type}`;
  authMessage.textContent = message;
  authMessage.classList.remove("hidden");
}

function updateMode() {
  const isAdmin = selectedRole === "admin";

  if (isAdmin) {
    // Admin login is separate and does not allow registration.
    isLoginMode = true;
    authTitle.textContent = "Connexion Administrateur";
    roleDescription.textContent = "Connectez-vous avec votre nom d'utilisateur admin et mot de passe.";
    nameGroup.classList.add("hidden");
    usernameGroup.classList.remove("hidden");
    emailGroup.classList.add("hidden");
    usernameInput.required = true;
    emailInput.required = false;
    usernameInput.placeholder = "Ex: admin";
    switchModeBtn.classList.add("hidden");
    return;
  }

  authTitle.textContent = isLoginMode ? "Connexion Étudiant" : "Inscription Étudiant";
  roleDescription.textContent = "Utilisez votre compte académique pour accéder à la plateforme.";
  nameGroup.classList.toggle("hidden", isLoginMode);
  usernameGroup.classList.add("hidden");
  emailGroup.classList.remove("hidden");
  usernameInput.required = false;
  emailInput.required = true;
  emailLabel.textContent = "Email académique";
  emailInput.type = "email";
  emailInput.placeholder = "nom@etu.univ.ac.ma";
  switchModeBtn.classList.remove("hidden");
  switchModeBtn.textContent = isLoginMode
    ? "Pas de compte ? Créez un compte étudiant"
    : "Déjà inscrit ? Connectez-vous";
}

switchModeBtn.addEventListener("click", () => {
  isLoginMode = !isLoginMode;
  authMessage.classList.add("hidden");
  updateMode();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const name = document.getElementById("name").value.trim();

  try {
    if (selectedRole === "admin") {
      const data = await apiRequest("/auth/admin/login", "POST", { username: username || email, password });
      setSession(data.token, data.user);
      window.location.href = "/pages/admin.html";
      return;
    }

    if (isLoginMode) {
      const data = await apiRequest("/auth/student/login", "POST", { email, password });
      setSession(data.token, data.user);
      window.location.href = "/pages/accueil.html";
      return;
    }

    if (!name) {
      showAuthMessage("Le nom est obligatoire.");
      return;
    }
    if (!academicEmailRegex.test(email)) {
      showAuthMessage("Veuillez utiliser un email académique se terminant par .ac.ma.");
      return;
    }

    await apiRequest("/auth/student/register", "POST", { name, email, password });
    showAuthMessage(
      "Inscription envoyée. Votre compte sera activé après validation par un administrateur.",
      "success"
    );
    isLoginMode = true;
    updateMode();
  } catch (error) {
    showAuthMessage(error.message);
  }
});

updateMode();
