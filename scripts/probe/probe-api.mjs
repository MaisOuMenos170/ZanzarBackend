/**
 * Lê health, uma amostra de lugares e uma foto da API.
 * A URL com lat/lng e o photo_reference não vão para stdout.
 */
import { writeFile } from "node:fs/promises";
import { formatProbeReport } from "./report.mjs";

const DEFAULT_BASE_URL = "https://zanzarbackend-development.up.railway.app";
const SAMPLE_LIMIT = 5;

const probePoint = {
  lat: "-25.4284",
  lng: "-49.2733",
};

export async function runProbe(baseUrl, fetchImpl = fetch) {
  const root = baseUrl.replace(/\/+$/, "");
  const health = await readHealth(root, fetchImpl);
  const places = await readPlaces(root, fetchImpl);
  const photo = places.photoReference
    ? await readPhoto(root, places.photoReference, fetchImpl)
    : { ok: false };
  return {
    ok: health.ok && places.ok && photo.ok,
    health,
    places: { ok: places.ok, status: places.status, count: places.count },
    photo,
  };
}

async function readHealth(root, fetchImpl) {
  try {
    const response = await fetchImpl(`${root}/health`);
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const body = await response.json();
    return { ok: body?.status === "ok", status: response.status };
  } catch {
    return { ok: false };
  }
}

async function readPlaces(root, fetchImpl) {
  const params = new URLSearchParams({
    lat: probePoint.lat,
    lng: probePoint.lng,
    limit: String(SAMPLE_LIMIT),
  });
  try {
    const response = await fetchImpl(`${root}/places?${params}`);
    if (!response.ok) {
      return { ok: false, status: response.status, count: 0, photoReference: null };
    }
    const body = await response.json();
    if (!Array.isArray(body) || body.length === 0) {
      return { ok: false, status: response.status, count: 0, photoReference: null };
    }
    return {
      ok: true,
      status: response.status,
      count: body.length,
      photoReference: firstPhotoReference(body),
    };
  } catch {
    return { ok: false, count: 0, photoReference: null };
  }
}

function firstPhotoReference(places) {
  for (const place of places) {
    const photos = place?.photos;
    if (!Array.isArray(photos)) continue;
    for (const photo of photos) {
      const reference = photo?.photo_reference;
      if (typeof reference === "string" && reference.length > 0) {
        return reference;
      }
    }
  }
  return null;
}

async function readPhoto(root, reference, fetchImpl) {
  const params = new URLSearchParams({ ref: reference, maxwidth: "400" });
  try {
    const response = await fetchImpl(`${root}/places/photo?${params}`);
    const contentType = response.headers.get("content-type") ?? "";
    const ok = response.ok && contentType.startsWith("image/");
    return ok ? { ok: true } : { ok: false, status: response.status };
  } catch {
    return { ok: false };
  }
}

async function main() {
  const outFlag = process.argv.indexOf("--out");
  const outPath = outFlag === -1 ? "" : process.argv[outFlag + 1];
  const baseUrl = process.env.PROBE_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const result = await runProbe(baseUrl);
  const report = formatProbeReport(result);
  if (outPath) {
    await writeFile(outPath, `${report}\n`);
  } else {
    process.stdout.write(`${report}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

const isDirectRun = process.argv[1]?.endsWith("probe-api.mjs");
if (isDirectRun) {
  await main();
}
