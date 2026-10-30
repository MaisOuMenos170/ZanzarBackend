/**
 * Adiciona fotos da Wikimedia Commons (licença livre) a um lugar, em data/place-images.json.
 *
 * A Commons serve a imagem por URL pública, então só guardamos a URL, o autor e a licença.
 * A escolha do arquivo é manual: buscar por proximidade traz fotos do entorno, não do lugar.
 *
 *   npm run images:add -- --place <place_id> --commons "File:Passeio Publico.jpg"
 *   npm run images:add -- --place <place_id> --commons "File:A.jpg" --commons "File:B.jpg" --apply
 *
 * Sem --apply consulta a Commons e mostra o que seria gravado, sem escrever nada.
 * Aceita CC0, domínio público, CC BY e CC BY-SA. Recusa NC e ND.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = path.join(ROOT_DIR, "data/place-images.json");
const CATALOG_PATH = path.join(ROOT_DIR, "data/lugares.json");
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const THUMB_WIDTH = 800;
const USER_AGENT = "ZanzarBackend/1.0 (place photo curation script; contact: lucas.dalprabrascher@gmail.com)";

const ACCEPTED_LICENSE = /^(CC0|CC BY(-SA)? \d(\.\d)?|Public domain|PD\b)/i;
const REJECTED_LICENSE = /\b(NC|ND)\b/i;

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converte a página `imageinfo` da API em uma entrada do manifesto.
 * Devolve { image } ou { error } com o motivo da recusa.
 */
export function parseCommonsImage(page) {
  const title = page?.title ?? "arquivo";
  const info = page?.imageinfo?.[0];
  if (page?.missing || !info) return { error: `${title}: arquivo não encontrado na Commons` };

  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value);
  if (!license) return { error: `${title}: a Commons não informa a licença` };
  if (REJECTED_LICENSE.test(license) || !ACCEPTED_LICENSE.test(license)) {
    return { error: `${title}: licença "${license}" não aceita (use CC0, domínio público, CC BY ou CC BY-SA)` };
  }

  const author = stripHtml(meta.Artist?.value);
  if (!author) return { error: `${title}: a Commons não informa o autor` };

  const rawUrl = info.thumburl ?? info.url;
  if (!rawUrl?.startsWith("https://")) return { error: `${title}: sem URL https` };
  // A API acrescenta parâmetros de rastreio (utm_*) que não fazem parte da imagem.
  const parsedUrl = new URL(rawUrl);
  parsedUrl.search = "";
  const url = parsedUrl.toString();

  const credit = {
    author,
    license,
    sourceUrl: info.descriptionurl,
  };
  const licenseUrl = stripHtml(meta.LicenseUrl?.value);
  if (licenseUrl.startsWith("https://")) credit.licenseUrl = licenseUrl;

  // `thumbwidth`/`thumbheight` nem sempre batem com o arquivo do `thumburl` (a Commons arredonda o tamanho),
  // então as dimensões ficam de fora; o app não precisa delas.
  return { image: { url, credit } };
}

/** Acrescenta imagens novas ao manifesto sem repetir URLs. */
export function addImages(manifest, placeId, images) {
  const current = manifest[placeId] ?? [];
  const known = new Set(current.map((image) => image.url));
  const added = images.filter((image) => !known.has(image.url));
  return { manifest: { ...manifest, [placeId]: [...current, ...added] }, added };
}

async function fetchCommonsPages(titles) {
  const url = new URL(COMMONS_API);
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist",
    maxlag: "5",
  });
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip" } });
  if (!response.ok) throw new Error(`Commons respondeu HTTP ${response.status}`);
  const body = await response.json();
  return body.query?.pages ?? [];
}

function parseArgs(argv) {
  const args = { place: undefined, commons: [], apply: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--place") args.place = argv[++i];
    else if (arg === "--commons") args.commons.push(argv[++i]);
    else if (arg === "--apply") args.apply = true;
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  if (!args.place) throw new Error("Informe --place <place_id>");
  if (args.commons.length === 0) throw new Error('Informe ao menos um --commons "File:Nome.jpg"');
  args.commons = args.commons.map((title) => (/^File:/i.test(title) ? title : `File:${title}`));
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const place = catalog.find((entry) => entry.place_id === args.place);
  if (!place) throw new Error(`place_id ${args.place} não está em data/lugares.json`);
  console.log(`Lugar: ${place.name}`);

  // A API devolve as páginas em outra ordem; mantém a ordem pedida, que é a do carrossel.
  const normalize = (title) => title.replaceAll("_", " ").toLowerCase();
  const requested = args.commons.map(normalize);
  const position = (page) => {
    const index = requested.indexOf(normalize(page.title ?? ""));
    return index === -1 ? requested.length : index;
  };
  const pages = (await fetchCommonsPages(args.commons)).sort((a, b) => position(a) - position(b));
  const images = [];
  const errors = [];
  for (const page of pages) {
    const result = parseCommonsImage(page);
    if (result.image) images.push(result.image);
    else errors.push(result.error);
  }

  const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : {};
  const result = addImages(manifest, args.place, images);

  for (const image of result.added) {
    console.log(`+ ${image.url}\n    ${image.credit.author} · ${image.credit.license}`);
  }
  if (images.length > result.added.length) console.log(`(${images.length - result.added.length} já estava no manifesto)`);
  for (const error of errors) console.log(`! ${error}`);

  if (!args.apply) {
    console.log("Simulação: nada foi gravado. Use --apply para gravar em data/place-images.json.");
    return;
  }
  if (result.added.length === 0) {
    console.log("Nada novo para gravar.");
    return;
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(result.manifest, null, 2)}\n`);
  console.log(`Gravado: ${MANIFEST_PATH}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  });
}
