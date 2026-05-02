// Accueil: show platform link only after the user has a session (JWT in localStorage).
(function () {
  const wrapper = document.getElementById("platformLinkWrapper");
  if (!wrapper) return;

  if (typeof getToken === "function" && getToken()) {
    wrapper.classList.remove("hidden");
  }
})();
