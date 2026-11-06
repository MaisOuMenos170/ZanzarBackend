// Review page for the Lero team. Talks to /login and /admin/api with the account's access token,
// kept only in this tab (sessionStorage). Every decision sends the status it saw, so two reviewers cannot clash.
const main = document.getElementById("main");
const statusSelect = document.getElementById("status");
const reloadButton = document.getElementById("reload");
const logoutButton = document.getElementById("logout");
const loginForm = document.getElementById("login");
const template = document.getElementById("card");

const reasonLabels = {
  nudity: "Nudez", violence: "Violência", minors: "Menores", face_prominent: "Pessoa reconhecível",
  personal_data: "Dados pessoais", offensive_text: "Texto ofensivo", watermark: "Marca d'água",
  not_the_place: "Não mostra o lugar", possible_duplicate: "Parece repetida", low_trust: "Autor novo ou com histórico",
  layer_unavailable: "Uma checagem falhou", low_quality: "Qualidade ruim", reported: "Denunciada", other: "Outro",
};

function token() {
  try { return sessionStorage.getItem("lero-admin-token"); } catch { return null; }
}

function setToken(value) {
  try { value ? sessionStorage.setItem("lero-admin-token", value) : sessionStorage.removeItem("lero-admin-token"); } catch { /* private mode */ }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
  });
  if (response.status === 401 || response.status === 404 && path.startsWith("/admin/api/photos?")) {
    setToken(null);
    showLogin("Sessão expirada ou conta sem acesso de equipe.");
    throw new Error("unauthorized");
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.message || `HTTP ${response.status}`), { body });
  return body;
}

function showLogin(message = "") {
  statusSelect.hidden = reloadButton.hidden = logoutButton.hidden = true;
  main.replaceChildren(loginForm);
  document.getElementById("login-error").textContent = message;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm));
  const response = await fetch("/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  if (!response.ok) return showLogin("E-mail ou senha incorretos.");
  setToken((await response.json()).token);
  loginForm.reset();
  load();
});

logoutButton.addEventListener("click", () => { setToken(null); showLogin(); });
reloadButton.addEventListener("click", () => load());
statusSelect.addEventListener("change", () => load());

async function decide(photo, action, reason, card) {
  card.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  try {
    await api(`/admin/api/photos/${photo.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ action, expectedStatus: photo.status, ...(action === "approve" ? {} : { reason }) }),
    });
    card.remove();
    if (!main.querySelector(".card")) load();
  } catch (error) {
    if (error.message === "unauthorized") return;
    alert(error.body?.code === "stale_review" ? "Outra pessoa mudou esta foto. A lista vai ser atualizada." : `Não deu certo: ${error.message}`);
    load();
  }
}

function render(photos) {
  if (photos.length === 0) {
    main.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: "Nada nesta fila." }));
    return;
  }
  const grid = Object.assign(document.createElement("div"), { className: "grid" });
  for (const photo of photos) {
    const card = template.content.firstElementChild.cloneNode(true);
    const img = card.querySelector("img");
    if (photo.url) img.src = photo.url; else img.alt = "Arquivos já apagados";
    card.querySelector(".place").textContent = photo.placeName || photo.placeId;
    card.querySelector(".meta").textContent =
      `${photo.authorName || "autor removido"} · ${new Date(photo.createdAt).toLocaleString("pt-BR")} · ${photo.isVerifiedCheckIn ? "com check-in" : "sem check-in"}`;
    card.querySelector(".reason").textContent = photo.decisionReason ? `Motivo: ${reasonLabels[photo.decisionReason] || photo.decisionReason}` : "";
    const layers = card.querySelector(".layers");
    for (const layer of photo.moderation) {
      const chip = Object.assign(document.createElement("span"), { className: layer.verdict });
      chip.textContent = `${layer.layer}: ${layer.verdict}${layer.reason ? ` (${reasonLabels[layer.reason] || layer.reason})` : ""}`;
      layers.append(chip);
    }
    card.querySelector(".reports").textContent = photo.reportCount
      ? `${photo.reportCount} denúncia(s): ${photo.reports.map((r) => r.reason + (r.note ? ` — "${r.note}"` : "")).join("; ")}` : "";
    const reasonSelect = card.querySelector(".reason-select");
    card.querySelector(".approve").hidden = photo.status === "approved";
    card.querySelector(".approve").addEventListener("click", () => decide(photo, "approve", null, card));
    card.querySelector(".reject").addEventListener("click", () => decide(photo, "reject", reasonSelect.value, card));
    card.querySelector(".remove").addEventListener("click", () => {
      if (confirm("Remover esta foto? Ela some do app e o autor é avisado.")) decide(photo, "remove", reasonSelect.value, card);
    });
    grid.append(card);
  }
  main.replaceChildren(grid);
}

async function load() {
  if (!token()) return showLogin();
  statusSelect.hidden = reloadButton.hidden = logoutButton.hidden = false;
  try {
    const { photos } = await api(`/admin/api/photos?status=${encodeURIComponent(statusSelect.value)}`);
    render(photos);
  } catch (error) {
    if (error.message !== "unauthorized") {
      main.replaceChildren(Object.assign(document.createElement("p"), { className: "error-box", textContent: `Não foi possível carregar: ${error.message}` }));
    }
  }
}

load();
