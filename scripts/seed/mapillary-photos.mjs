/**
 * Fotos de rua do Mapillary (CC BY-SA 4.0) para os lugares que não têm foto livre melhor.
 *
 * Os links de imagem do Mapillary expiram em cerca de um mês, então a foto é baixada, recortada em volta do
 * lugar (a posição do lugar na foto é calculada pela câmera) e guardada em data/photos/. O manifesto
 * data/place-images.json recebe a URL pública (PHOTOS_BASE_URL) e o crédito.
 *
 *   npm run photos:suggest -- --place <place_id>     # candidatas recortadas + página para marcar as boas
 *   npm run photos:suggest -- --missing             # o mesmo para todos os lugares sem foto
 *   npm run photos:suggest -- --missing --wide      # mais candidatas (até 8), de mais longe e de mais de lado
 *   npm run photos:add -- --place <place_id> --image <id do Mapillary> [--full] [--apply]
 *
 * Sem --apply, `add` só mostra o que faria. `--full` guarda a foto inteira, sem recorte.
 * Env: MAPILLARY_ACCESS_TOKEN (.env), PHOTOS_BASE_URL (opcional).
 */
import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG = path.join(ROOT_DIR, "data/lugares.json");
const MANIFEST = path.join(ROOT_DIR, "data/place-images.json");
const PHOTOS_DIR = path.join(ROOT_DIR, "data/photos");
const REVIEW_DIR = path.join(ROOT_DIR, "data/photos-review");
const BASE_URL = process.env.PHOTOS_BASE_URL ?? "https://cdn.jsdelivr.net/gh/MaisOuMenos170/ZanzarBackend@develop/data/photos/";
const GRAPH = "https://graph.mapillary.com";
const FIELDS = "id,captured_at,compass_angle,geometry,thumb_2048_url,creator,is_pano,sequence,camera_parameters";
const rad = Math.PI / 180;

/** Distância em metros entre dois pontos (aproximação plana, boa para dezenas de metros). */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const x = (lat2 - lat1) * rad;
  const y = (lng2 - lng1) * rad * Math.cos(lat1 * rad);
  return 6371000 * Math.hypot(x, y);
}

/** Rumo, em graus, do ponto 1 para o ponto 2. */
export function bearingDegrees(lat1, lng1, lat2, lng2) {
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

/** Quantos graus o lugar está para a direita (+) ou esquerda (-) do centro da foto. */
export function offsetDegrees(image, place) {
  const [imgLng, imgLat] = image.geometry.coordinates;
  const want = bearingDegrees(imgLat, imgLng, place.lat, place.lng);
  return ((want - image.compass_angle + 540) % 360) - 180;
}

/**
 * Retângulo (4:3) da foto onde o lugar deve aparecer, ou null se ele cai fora do quadro.
 * `focal` é a distância focal normalizada pelo maior lado, como o Mapillary a informa.
 */
export function cropBox({ width, height, focal }, offset, distance) {
  const focalPx = focal * Math.max(width, height);
  const x = width / 2 + focalPx * Math.tan(offset * rad);
  if (x < 0.05 * width || x > 0.95 * width) return null;
  // As fachadas ficam um pouco abaixo da linha do horizonte da câmera.
  const y = height / 2 + 0.06 * height;
  const ideal = 2 * focalPx * Math.tan(Math.atan(11 / Math.max(distance, 8)));
  const cropWidth = Math.min(Math.max(ideal, 0.4 * width), 0.7 * width);
  const cropHeight = Math.min(cropWidth * 0.75, height);
  const left = Math.round(Math.min(Math.max(x - cropWidth / 2, 0), width - cropWidth));
  const top = Math.round(Math.min(Math.max(y - cropHeight / 2, 0), height - cropHeight));
  return { left, top, width: Math.round(cropWidth), height: Math.round(cropHeight) };
}

/** Candidatas viradas para o lugar, mais bem posicionadas primeiro, no máximo uma por sequência. */
export function rankCandidates(place, images, { limit = 4, maxDistance = 55, maxOffset = 38, now = Date.now() } = {}) {
  const scored = [];
  for (const image of images) {
    if (image.is_pano || !image.thumb_2048_url || !image.camera_parameters) continue;
    const [imgLng, imgLat] = image.geometry.coordinates;
    const distance = distanceMeters(place.lat, place.lng, imgLat, imgLng);
    const offset = offsetDegrees(image, place);
    if (distance < 10 || distance > maxDistance || Math.abs(offset) > maxOffset) continue;
    // O lugar precisa cair dentro do quadro: tan(ângulo) até 90% de meia largura (0,5 / focal, com a focal normalizada).
    if (Math.tan(Math.abs(offset) * rad) > 0.45 / image.camera_parameters[0]) continue;
    const years = (now - image.captured_at) / 3.15e10;
    scored.push({ image, distance, offset, score: Math.abs(offset) * 0.5 + Math.abs(distance - 28) * 0.4 + years * 0.8 });
  }
  scored.sort((a, b) => a.score - b.score);
  const seen = new Set();
  const picks = [];
  for (const candidate of scored) {
    if (seen.has(candidate.image.sequence)) continue;
    seen.add(candidate.image.sequence);
    picks.push(candidate);
    if (picks.length === limit) break;
  }
  return picks;
}

const slugify = (name) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function token() {
  const value = process.env.MAPILLARY_ACCESS_TOKEN?.trim();
  if (!value) throw new Error("MAPILLARY_ACCESS_TOKEN não está definido no .env");
  return value;
}

async function graph(pathname, params) {
  const url = new URL(`${GRAPH}${pathname}`);
  url.search = new URLSearchParams({ access_token: token(), ...params });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mapillary respondeu HTTP ${response.status}`);
  return response.json();
}

function toPlace(entry) {
  return { id: entry.place_id, name: entry.name, lat: entry.geometry.location.lat, lng: entry.geometry.location.lng };
}

async function nearbyImages(place) {
  const d = 0.0007;
  const bbox = [place.lng - d, place.lat - d, place.lng + d, place.lat + d].join(",");
  return (await graph("/images", { fields: FIELDS, bbox, limit: "1000" })).data ?? [];
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download falhou: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** Foto (recortada em volta do lugar, a menos que `full`) pronta para guardar. */
async function render(place, image, { full = false } = {}) {
  const buffer = await download(image.thumb_2048_url);
  const meta = await sharp(buffer).metadata();
  let pipeline = sharp(buffer);
  let cropped = false;
  if (!full) {
    const [imgLng, imgLat] = image.geometry.coordinates;
    const box = cropBox(
      { width: meta.width, height: meta.height, focal: image.camera_parameters[0] },
      offsetDegrees(image, place),
      distanceMeters(place.lat, place.lng, imgLat, imgLng),
    );
    if (box) {
      pipeline = pipeline.extract(box);
      cropped = true;
    }
  }
  const output = await pipeline.resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  return { output, cropped };
}

const mapillaryLink = (id) => `https://www.mapillary.com/app/?pKey=${id}&focus=photo`;

function credit(image) {
  return {
    author: `${image.creator?.username ?? "Contribuidor"} (Mapillary)`,
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: mapillaryLink(image.id),
  };
}

function parseArgs(argv) {
  const args = { _: argv[0], place: undefined, image: undefined, full: false, apply: false, missing: false, wide: false };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--place") args.place = argv[++i];
    else if (arg === "--image") args.image = argv[++i];
    else if (arg === "--full") args.full = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--missing") args.missing = true;
    else if (arg === "--wide") args.wide = true;
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  return args;
}

async function suggest(args) {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  const targets = args.missing
    ? catalog.filter((p) => !manifest[p.place_id] && !/^R\. /.test(p.name))
    : catalog.filter((p) => p.place_id === args.place);
  if (targets.length === 0) throw new Error("Nenhum lugar encontrado (use --place <place_id> ou --missing)");

  mkdirSync(REVIEW_DIR, { recursive: true });
  const sections = [];
  const withoutCandidates = [];
  for (const entry of targets) {
    const place = toPlace(entry);
    const picks = rankCandidates(place, await nearbyImages(place), args.wide ? { limit: 8, maxDistance: 75, maxOffset: 55 } : {});
    if (picks.length === 0) { withoutCandidates.push(entry.name); continue; }
    const cards = [];
    for (const [i, { image, distance, offset }] of picks.entries()) {
      const { output, cropped } = await render(place, image);
      const file = `${slugify(place.name)}-${image.id}.jpg`;
      writeFileSync(path.join(REVIEW_DIR, file), output);
      cards.push(`<label class="card"><img src="${file}" loading="lazy"><span class="meta"><input type="checkbox" value="${place.id} ${image.id}" onchange="upd()"> ${Math.round(distance)} m · ${new Date(image.captured_at).toISOString().slice(0, 7)} · ${cropped ? "recortada" : "inteira"} · <a target="_blank" href="${mapillaryLink(image.id)}">original</a></span></label>`);
      process.stdout.write(`${place.name} #${i + 1}\n`);
    }
    sections.push(`<section><h2>${entry.name}</h2><p>${(entry.formatted_address ?? "").replace(/, Brasil$/, "")}</p><div class="row">${cards.join("")}</div></section>`);
  }
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fotos sugeridas</title><style>body{font:15px system-ui;margin:0;background:#f6f6f7}header{position:sticky;top:0;background:#fff;padding:10px 16px;border-bottom:1px solid #ddd}textarea{width:100%;height:60px;margin-top:6px;font:13px ui-monospace}main{padding:8px 16px 60px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}.card{background:#fff;border:2px solid transparent;border-radius:10px;overflow:hidden;display:block}.card:has(input:checked){border-color:#2e9e4f}img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block}.meta{display:block;padding:8px;font-size:13px}</style><header><b>Marque as boas</b> e rode os comandos abaixo (ou me mande a lista)<textarea id="o" readonly></textarea></header><main>${sections.join("")}${withoutCandidates.length ? `<section><h2>Sem candidatas</h2><ul>${withoutCandidates.map((n) => `<li>${n}</li>`).join("")}</ul></section>` : ""}</main><script>function upd(){document.getElementById("o").value=[...document.querySelectorAll("input:checked")].map(i=>{const[p,m]=i.value.split(" ");return"npm run photos:add -- --place "+p+" --image "+m+" --apply"}).join("\\n")}</script></html>`;
  writeFileSync(path.join(REVIEW_DIR, "index.html"), html);
  console.log(`\nPágina: ${path.join(REVIEW_DIR, "index.html")}`);
  if (withoutCandidates.length) console.log(`Sem candidatas: ${withoutCandidates.join(", ")}`);
}

async function add(args) {
  if (!args.place || !args.image) throw new Error("Informe --place <place_id> e --image <id do Mapillary>");
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  const entry = catalog.find((p) => p.place_id === args.place);
  if (!entry) throw new Error(`place_id ${args.place} não está em data/lugares.json`);
  const place = toPlace(entry);
  const image = await graph(`/${args.image}`, { fields: FIELDS });
  if (!image.thumb_2048_url) throw new Error("Imagem não encontrada no Mapillary");

  const { output, cropped } = await render(place, image, { full: args.full });
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
  const current = manifest[place.id] ?? [];
  const file = `${slugify(place.name)}-${current.length + 1}.jpg`;
  const entryToAdd = { url: `${BASE_URL}${file}`, credit: credit(image) };

  console.log(`${place.name}: ${file} (${cropped ? "recortada em volta do lugar" : "inteira"}, ${Math.round(output.length / 1024)} KB)`);
  console.log(`  crédito: ${entryToAdd.credit.author} · ${entryToAdd.credit.license}`);
  if (!args.apply) { console.log("Simulação: nada foi gravado. Use --apply."); return; }
  mkdirSync(PHOTOS_DIR, { recursive: true });
  writeFileSync(path.join(PHOTOS_DIR, file), output);
  manifest[place.id] = [...current, entryToAdd];
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("Gravado em data/photos/ e data/place-images.json.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  (args._ === "suggest" ? suggest(args) : args._ === "add" ? add(args) : Promise.reject(new Error("Use `suggest` ou `add`")))
    .catch((err) => { console.error(`Erro: ${err.message}`); process.exit(1); });
}
