const API_BASE_URL = "/api";

function getToken() {
  return localStorage.getItem("token");
}

function getCurrentUser() {
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function setSession(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const data = await response.json();
      if (data && data.message) return data.message;
      if (typeof data === "string") return data;
    } catch {
      /* falls through */
    }
  }

  const text = await response.text();
  const looksLikeHtml =
    /^\s*</.test(text) && (text.includes("<!DOCTYPE") || text.includes("<html"));

  if (looksLikeHtml) {
    return (
      `Le serveur a renvoyé une page HTML au lieu de JSON (code ${response.status}). ` +
      "Ouvrez le site via http://localhost:5000 (après npm start), pas en fichier local. " +
      "Vérifiez aussi que l’API tourne sur le même hôte et port que la page."
    );
  }

  return text.trim().slice(0, 280) || `Erreur HTTP ${response.status}`;
}

async function apiRequest(endpoint, method = "GET", body = null, isFormData = false) {
  const headers = {};
  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : null,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "Réponse inattendue du serveur (pas du JSON). Utilisez http://localhost:5000 avec npm start."
    );
  }
}
