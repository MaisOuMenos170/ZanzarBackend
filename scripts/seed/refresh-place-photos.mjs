/**
 * Renova as `photos[].photo_reference` de data/lugares.json pelo Place Details do Google.
 *
 * As referências de foto do Google expiram depois de algumas semanas; as expiradas fazem
 * GET /places/photo falhar (o Google responde 400). Este script busca referências novas pelo
 * `place_id` de cada lugar e grava o resultado em OUTRO arquivo. Ele nunca escreve no Atlas
 * nem sobrescreve o arquivo de entrada.
 *
 *   npm run refresh:photos                      # simulação: só conta as requisições, não chama o Google
 *   npm run refresh:photos -- --apply           # chama o Google e grava data/lugares.refreshed.json
 *   npm run refresh:photos -- --apply --only-stale
 *                                               # só renova lugares cuja primeira foto já falha
 *                                               # (1 requisição de checagem por lugar a mais)
 *
 * Opções: --input <arquivo>  --output <arquivo>
 * Env: GOOGLE_PLACES_API_KEY (lida do .env; o valor nunca é impresso).
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const CONCURRENCY = 4;

function parseArgs(argv) {
  const args = {
    apply: false,
    onlyStale: false,
    input: path.join(ROOT_DIR, "data/lugares.json"),
    output: path.join(ROOT_DIR, "data/lugares.refreshed.json"),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--only-stale") args.onlyStale = true;
    else if (arg === "--input") args.input = path.resolve(argv[++i] ?? "");
    else if (arg === "--output") args.output = path.resolve(argv[++i] ?? "");
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  if (args.input === args.output) {
    throw new Error("--output não pode ser o mesmo arquivo de --input");
  }
  return args;
}

/** Troca a chave por <key> em qualquer texto que possa ir para o terminal. */
function redact(text, key) {
  return key ? String(text).replaceAll(key, "<key>") : String(text);
}

/** Forma dos itens de `photos` no lugares.json: mantém `proxy_url` quando o arquivo original tinha. */
export function toSeedPhoto(googlePhoto, template) {
  const photo = {
    photo_reference: googlePhoto.photo_reference,
    height: googlePhoto.height,
    width: googlePhoto.width,
  };
  if (template && "proxy_url" in template) {
    photo.proxy_url = `/api/places/photo?ref=${googlePhoto.photo_reference}`;
  }
  return photo;
}

async function photoIsValid(reference, key) {
  const url = new URL(PHOTO_URL);
  url.searchParams.set("maxwidth", "100");
  url.searchParams.set("photoreference", reference);
  url.searchParams.set("key", key);
  // 302 = referência válida; não baixamos a imagem.
  const response = await fetch(url, { redirect: "manual" });
  return response.status === 302 || response.status === 200;
}

async function fetchFreshPhotos(placeId, key) {
  const url = new URL(DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "photos");
  url.searchParams.set("key", key);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body.status !== "OK") {
    throw new Error(`Google status ${body.status}`);
  }
  return body.result?.photos ?? [];
}

async function runPool(items, worker) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        await worker(queue.shift());
      }
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const places = JSON.parse(readFileSync(args.input, "utf8"));
  if (!Array.isArray(places)) {
    throw new Error("lugares.json deve ser um array JSON");
  }

  const candidates = places.filter((place) => typeof place.place_id === "string" && place.place_id);
  const skipped = places.length - candidates.length;
  const checkRequests = args.onlyStale ? candidates.filter((p) => p.photos?.length).length : 0;

  console.log(`Entrada: ${args.input} (${places.length} lugares, ${skipped} sem place_id ignorados)`);
  console.log(`Place Details a chamar: ${candidates.length}${args.onlyStale ? " no máximo (só os com foto vencida)" : ""}`);
  if (args.onlyStale) {
    console.log(`Checagens de foto (302/400): ${checkRequests}`);
  }
  console.log(
    `Total de requisições ao Google: ${args.onlyStale ? `${checkRequests} + até ${candidates.length}` : candidates.length}`,
  );

  if (!args.apply) {
    console.log("Simulação: nada foi chamado e nada foi gravado. Use --apply para executar.");
    return;
  }

  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    throw new Error("GOOGLE_PLACES_API_KEY não está definida (.env)");
  }

  const refreshed = new Map();
  const failures = [];
  let alreadyValid = 0;

  await runPool(candidates, async (place) => {
    try {
      if (args.onlyStale && place.photos?.length && (await photoIsValid(place.photos[0].photo_reference, key))) {
        alreadyValid++;
        return;
      }
      const fresh = await fetchFreshPhotos(place.place_id, key);
      refreshed.set(
        place.place_id,
        fresh.map((photo, index) => toSeedPhoto(photo, place.photos?.[index] ?? place.photos?.[0])),
      );
    } catch (err) {
      failures.push({ name: place.name, place_id: place.place_id, reason: redact(err.message, key) });
    }
  });

  let changed = 0;
  let nowEmpty = 0;
  const output = places.map((place) => {
    const photos = refreshed.get(place.place_id);
    // Sem resposta nova (falha, ou Google devolveu 0 fotos), mantém o que já havia.
    if (!photos || photos.length === 0) {
      if (photos && photos.length === 0) nowEmpty++;
      return place;
    }
    changed++;
    return { ...place, photos };
  });

  writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`Gravado: ${args.output}`);
  console.log(`Lugares com fotos renovadas: ${changed}`);
  if (args.onlyStale) console.log(`Já válidos (não alterados): ${alreadyValid}`);
  console.log(`Google devolveu 0 fotos (mantido o original): ${nowEmpty}`);
  console.log(`Falhas (mantido o original): ${failures.length}`);
  for (const failure of failures) {
    console.log(`  - ${failure.name} (${failure.place_id}): ${failure.reason}`);
  }
  console.log("Confira o arquivo gerado antes de copiá-lo para data/lugares.json e rodar o seed.");
}

// Só executa quando chamado direto, para o toSeedPhoto poder ser importado em testes.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  });
}
