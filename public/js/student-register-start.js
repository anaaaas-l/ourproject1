const registerStartForm = document.getElementById("registerStartForm");
const registerStartMessage = document.getElementById("registerStartMessage");
const studentEmailInput = document.getElementById("studentEmail");
const academicEmailRegex = /^[^\s@]+@[^\s@]*\.ac\.ma$/i;

function showMessage(message, type = "danger") {
  registerStartMessage.className = `alert alert-${type}`;
  registerStartMessage.textContent = message;
  registerStartMessage.classList.remove("hidden");
}

registerStartForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = studentEmailInput.value.trim().toLowerCase();

  if (!academicEmailRegex.test(email)) {
    showMessage("Veuillez utiliser un email académique se terminant par .ac.ma.");
    return;
  }

  try {
    const data = await apiRequest("/auth/student/register/request-link", "POST", { email });
    showMessage(data.message || "Lien de vérification envoyé.", "success");

    // Helpful in local/dev mode if SMTP is not configured.
    if (data.devVerificationLink) {
      showMessage(
        `${data.message}\n\nMode test: ouvrez ce lien: ${data.devVerificationLink}`,
        "warning"
      );
    }
    registerStartForm.reset();
  } catch (error) {
    showMessage(error.message);
  }
});
