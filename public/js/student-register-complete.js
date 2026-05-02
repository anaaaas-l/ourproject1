const registerCompleteForm = document.getElementById("registerCompleteForm");
const registerCompleteMessage = document.getElementById("registerCompleteMessage");
const verifiedEmailText = document.getElementById("verifiedEmailText");
const studentNameInput = document.getElementById("studentName");
const studentPasswordInput = document.getElementById("studentPassword");
const token = new URLSearchParams(window.location.search).get("token");

function showMessage(message, type = "danger") {
  registerCompleteMessage.className = `alert alert-${type}`;
  registerCompleteMessage.textContent = message;
  registerCompleteMessage.classList.remove("hidden");
}

async function verifyToken() {
  if (!token) {
    showMessage("Lien invalide: token manquant.");
    registerCompleteForm.classList.add("hidden");
    return;
  }

  try {
    const result = await apiRequest(`/auth/student/register/verify-token?token=${encodeURIComponent(token)}`);
    verifiedEmailText.textContent = `Email vérifié: ${result.email}`;
  } catch (error) {
    showMessage(error.message);
    registerCompleteForm.classList.add("hidden");
  }
}

registerCompleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = studentNameInput.value.trim();
  const password = studentPasswordInput.value;

  if (!name || !password) {
    showMessage("Nom et mot de passe requis.");
    return;
  }

  try {
    const result = await apiRequest("/auth/student/register/complete", "POST", {
      token,
      name,
      password,
    });
    showMessage(result.message || "Inscription terminée.", "success");
    registerCompleteForm.reset();
    setTimeout(() => {
      window.location.href = "/pages/auth.html?role=student";
    }, 2200);
  } catch (error) {
    showMessage(error.message);
  }
});

verifyToken();
