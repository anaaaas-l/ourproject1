const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetMessage = document.getElementById("resetMessage");
const verifiedEmailText = document.getElementById("verifiedEmailText");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const token = new URLSearchParams(window.location.search).get("token");

function showMessage(message, type = "danger") {
  resetMessage.className = `alert alert-${type}`;
  resetMessage.textContent = message;
  resetMessage.classList.remove("hidden");
}

async function verifyToken() {
  if (!token) {
    showMessage("Lien invalide : aucun jeton dans l’URL.");
    resetPasswordForm.classList.add("hidden");
    return;
  }

  try {
    const result = await apiRequest(`/auth/student/reset-password/verify-token?token=${encodeURIComponent(token)}`);
    verifiedEmailText.textContent = `Compte : ${result.email}`;
  } catch (error) {
    showMessage(error.message);
    resetPasswordForm.classList.add("hidden");
  }
}

resetPasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = newPasswordInput.value;
  const confirm = confirmPasswordInput.value;

  if (password.length < 6) {
    showMessage("Le mot de passe doit contenir au moins 6 caractères.");
    return;
  }
  if (password !== confirm) {
    showMessage("Les deux mots de passe ne correspondent pas.");
    return;
  }

  try {
    const result = await apiRequest("/auth/student/reset-password", "POST", { token, password });
    showMessage(result.message || "Mot de passe mis à jour.", "success");
    resetPasswordForm.reset();
    resetPasswordForm.classList.add("hidden");
  } catch (error) {
    showMessage(error.message);
  }
});

verifyToken();
