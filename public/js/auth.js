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
const forgotPasswordStudentWrap = document.getElementById("forgotPasswordStudentWrap");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
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
    authTitle.textContent = "Connexion Administrateur";
    roleDescription.textContent = "Connectez-vous avec votre nom d'utilisateur admin et mot de passe.";
    nameGroup.classList.add("hidden");
    usernameGroup.classList.remove("hidden");
    emailGroup.classList.add("hidden");
    usernameInput.required = true;
    emailInput.required = false;
    usernameInput.placeholder = "Ex: admin";
    switchModeBtn.classList.add("hidden");
    if (forgotPasswordStudentWrap) forgotPasswordStudentWrap.classList.add("hidden");
    return;
  }

  authTitle.textContent = "Connexion Étudiant";
  roleDescription.textContent =
    "Connectez-vous avec votre email académique. Pour créer un compte, cliquez sur le bouton d'inscription.";
  nameGroup.classList.add("hidden");
  usernameGroup.classList.add("hidden");
  emailGroup.classList.remove("hidden");
  usernameInput.required = false;
  emailInput.required = true;
  emailLabel.textContent = "Email académique";
  emailInput.type = "email";
  emailInput.placeholder = "nom@etu.univ.ac.ma";
  switchModeBtn.classList.remove("hidden");
  switchModeBtn.textContent = "Pas de compte ? Créez un compte étudiant";
  if (forgotPasswordStudentWrap) forgotPasswordStudentWrap.classList.remove("hidden");
}

switchModeBtn.addEventListener("click", () => {
  if (selectedRole === "student") {
    window.location.href = "/pages/student-register-start.html";
  }
});

if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", async () => {
    if (selectedRole !== "student") return;
    const email = emailInput.value.trim();
    if (!email) {
      showAuthMessage("Indiquez d’abord votre email académique.", "warning");
      return;
    }
    forgotPasswordBtn.disabled = true;
    try {
      const data = await apiRequest("/auth/student/forgot-password", "POST", { email });
      const msg = data.message || "Demande traitée.";
      showAuthMessage(
        data.devResetLink ? `${msg} Lien de test : ${data.devResetLink}` : msg,
        data.devResetLink ? "warning" : "success"
      );
    } catch (error) {
      showAuthMessage(error.message);
    } finally {
      forgotPasswordBtn.disabled = false;
    }
  });
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    if (selectedRole === "admin") {
      const data = await apiRequest("/auth/admin/login", "POST", { username: username || email, password });
      setSession(data.token, data.user);
      window.location.href = "/pages/admin.html";
      return;
    }

    const data = await apiRequest("/auth/student/login", "POST", { email, password });
    setSession(data.token, data.user);
    window.location.href = "/";
  } catch (error) {
    showAuthMessage(error.message);
  }
});

updateMode();
