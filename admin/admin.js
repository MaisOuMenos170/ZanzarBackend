// Review page for the Lero team. Talks to /login and /admin/api with the account's access token,
// kept only in this tab (sessionStorage). Every decision sends the status it saw, so two reviewers cannot clash.
const main = document.getElementById("main");
const kindSelect = document.getElementById("kind");
const statusSelect = document.getElementById("status");
const reloadButton = document.getElementById("reload");
const logoutButton = document.getElementById("logout");
const loginForm = document.getElementById("login");
const template = document.getElementById("card");
const placeTemplate = document.getElementById("place-card");

const reasonLabels = {
  nudity: "Nudez", violence: "Violência", minors: "Menores", face_prominent: "Pessoa reconhecível",
  personal_data: "Dados pessoais", offensive_text: "Texto ofensivo", watermark: "Marca d'água",
  not_the_place: "Não mostra o lugar", possible_duplicate: "Parece repetida", low_trust: "Autor novo ou com histórico",
  layer_unavailable: "Uma checagem falhou", low_quality: "Qualidade ruim", reported: "Denunciada", other: "Outro",
  outside_area: "Fora de Curitiba e região", type_not_accepted: "Tipo de lugar não aceito", duplicate: "Já existe",
  manual_entry: "Digitado à mão (sem checagem automática)", not_a_real_place: "Não é um lugar real", inappropriate: "Conteúdo impróprio",
};

const photoStatuses = [["needs_review", "Precisam de revisão"], ["pending", "Em processamento"], ["approved", "Publicadas"], ["rejected", "Reprovadas"], ["removed", "Removidas"]];
const placeStatuses = [["needs_review", "Precisam de revisão"], ["approved", "Aprovados"], ["rejected", "Reprovados"]];

function fillStatuses() {
  const options = kindSelect.value === "places" ? placeStatuses : photoStatuses;
  statusSelect.replaceChildren(...options.map(([value, label]) => Object.assign(document.createElement("option"), { value, textContent: label })));
}
fillStatuses();

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
  if (response.status === 401 || (response.status === 404 && (path.startsWith("/admin/api/photos?") || path.startsWith("/admin/api/place-suggestions?")))) {
    setToken(null);
    showLogin("Sessão expirada ou conta sem acesso de equipe.");
    throw new Error("unauthorized");
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.message || `HTTP ${response.status}`), { body });
  return body;
}

function showLogin(message = "") {
  kindSelect.hidden = statusSelect.hidden = reloadButton.hidden = logoutButton.hidden = true;
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
kindSelect.addEventListener("change", () => { fillStatuses(); load(); });

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

async function decidePlace(suggestion, action, reason, card) {
  card.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  try {
    await api(`/admin/api/place-suggestions/${suggestion._id}/decision`, {
      method: "POST",
      body: JSON.stringify({ action, expectedStatus: suggestion.status, ...(action === "approve" ? {} : { reason }) }),
    });
    card.remove();
    if (!main.querySelector(".card")) load();
  } catch (error) {
    if (error.message === "unauthorized") return;
    const code = error.body?.code;
    alert(code === "stale_review" ? "Outra pessoa decidiu esta sugestão. A lista vai ser atualizada."
      : code === "unsupported_type" ? "Este tipo de lugar não é aceito, então não dá para aprovar."
      : `Não deu certo: ${error.message}`);
    load();
  }
}

function renderPlaces(suggestions) {
  if (suggestions.length === 0) {
    main.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: "Nada nesta fila." }));
    return;
  }
  const grid = Object.assign(document.createElement("div"), { className: "grid" });
  for (const suggestion of suggestions) {
    const card = placeTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".place").textContent = suggestion.name || "(sem nome: digitado à mão)";
    card.querySelector(".meta").textContent = `${new Date(suggestion.createdAt).toLocaleString("pt-BR")} · ${suggestion.osm ? `OpenStreetMap ${suggestion.osm.type}/${suggestion.osm.id}` : "sem referência no mapa"}`;
    card.querySelector(".address").textContent = suggestion.address;
    card.querySelector(".note").textContent = suggestion.note ? `Nota do usuário: “${suggestion.note}”` : "";
    card.querySelector(".reason").textContent = suggestion.decisionReason ? `Motivo: ${reasonLabels[suggestion.decisionReason] || suggestion.decisionReason}` : "";
    const layers = card.querySelector(".layers");
    for (const layer of suggestion.moderation) {
      const chip = Object.assign(document.createElement("span"), { className: layer.verdict });
      chip.textContent = `${layer.layer}: ${layer.verdict}${layer.reason ? ` (${reasonLabels[layer.reason] || layer.reason})` : ""}`;
      layers.append(chip);
    }
    const { latitude, longitude } = suggestion.coordinates;
    const link = card.querySelector(".map-link");
    link.hidden = latitude === 0 && longitude === 0;
    link.href = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
    const reasonSelect = card.querySelector(".reason-select");
    card.querySelector(".approve").hidden = suggestion.status === "approved";
    card.querySelector(".reject").hidden = reasonSelect.hidden = suggestion.status === "rejected";
    card.querySelector(".approve").addEventListener("click", () => {
      if (suggestion.osm || confirm("Esta sugestão foi digitada à mão: aprovar só marca como aceita, o lugar não entra no app sozinho. Continuar?")) {
        decidePlace(suggestion, "approve", null, card);
      }
    });
    card.querySelector(".reject").addEventListener("click", () => decidePlace(suggestion, "reject", reasonSelect.value, card));
    grid.append(card);
  }
  main.replaceChildren(grid);
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
  kindSelect.hidden = statusSelect.hidden = reloadButton.hidden = logoutButton.hidden = false;
  try {
    if (kindSelect.value === "places") {
      renderPlaces(await api(`/admin/api/place-suggestions?status=${encodeURIComponent(statusSelect.value)}`));
    } else {
      const { photos } = await api(`/admin/api/photos?status=${encodeURIComponent(statusSelect.value)}`);
      render(photos);
    }
  } catch (error) {
    if (error.message !== "unauthorized") {
      main.replaceChildren(Object.assign(document.createElement("p"), { className: "error-box", textContent: `Não foi possível carregar: ${error.message}` }));
    }
  }
}

load();
