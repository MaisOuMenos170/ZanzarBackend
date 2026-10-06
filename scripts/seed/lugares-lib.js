/**
 * Lógica compartilhada: lugares.json → documento MongoDB `places`.
 * Usado por seed e sync-from-github (mongosh load()).
 */

const inferencePath =
  process.env.LUGARES_INFERENCE_PATH ||
  (process.env.LUGARES_LIB_PATH
    ? process.env.LUGARES_LIB_PATH.replace(/lugares-lib\.js$/, 'lugares-inference.js')
    : 'scripts/seed/lugares-inference.js');
load(inferencePath);

function buildGeoLocation(raw) {
  const lat = raw?.geometry?.location?.lat;
  const lng = raw?.geometry?.location?.lng;
  if (lat == null || lng == null) return undefined;
  return { type: 'Point', coordinates: [lng, lat] };
}

function stripProxyUrl(photos) {
  if (!Array.isArray(photos)) return photos;
  return photos.map(({ proxy_url, ...photo }) => photo);
}

/**
 * Monta documento `places` para upsert.
 * Tags e nickname vêm do catálogo (lugares.json).
 * Preserva contadores Zanzar gerados pelo app (check-ins, impressões).
 */
function buildPlaceDocument(raw, existing) {
  const now = new Date();
  const { tags: catalogTags, nickname, ...placeFields } = raw;
  const { category, stampId } = inferZanzar(catalogTags, raw.types);
  const addedAt = existing?.added_at
    ? existing.added_at
    : raw.added_at
      ? new Date(raw.added_at)
      : now;

  const updatedAt = raw.updated_at ? new Date(raw.updated_at) : now;

  const existingZanzar = existing?.zanzar;
  const geoLocation = buildGeoLocation(raw);
  const doc = {
    ...placeFields,
    photos: stripProxyUrl(placeFields.photos),
    zanzar: {
      category,
      stampId,
      tags: Array.isArray(catalogTags) ? catalogTags : [],
      checkInCount: existingZanzar?.checkInCount ?? 0,
      impressionCounts: existingZanzar?.impressionCounts ?? {},
    },
    added_at: addedAt,
    updated_at: updatedAt,
    ...(geoLocation ? { geoLocation } : {}),
  };

  if (nickname != null && nickname !== '') {
    doc.nickname = nickname;
  }

  return doc;
}

function buildPlaceUpdate(raw, existing) {
  const doc = buildPlaceDocument(raw, existing);
  const update = { $set: doc };
  const unset = {};

  if (raw.nickname == null || raw.nickname === '') {
    unset.nickname = '';
  }

  // Limpa tags legadas no root (antes iam parar aqui via spread de raw).
  unset.tags = '';

  if (Object.keys(unset).length > 0) {
    update.$unset = unset;
  }

  return update;
}

function upsertPlaces(dbx, rawPlaces) {
  const results = {
    total: rawPlaces.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

  for (const raw of rawPlaces) {
    if (!raw.place_id) {
      results.errors.push({ reason: 'missing_place_id', name: raw.name });
      continue;
    }

    const existing = dbx.places.findOne({ place_id: raw.place_id });
    const update = buildPlaceUpdate(raw, existing);
    const op = dbx.places.updateOne(
      { place_id: raw.place_id },
      update,
      { upsert: true },
    );

    if (op.upsertedCount === 1) {
      results.inserted += 1;
    } else if (op.modifiedCount === 1) {
      results.updated += 1;
    } else {
      results.unchanged += 1;
    }
  }

  return results;
}

/**
 * Sincronização completa: upsert do catálogo + remoção de lugares que saíram do JSON.
 */
function syncPlaces(dbx, rawPlaces) {
  const results = upsertPlaces(dbx, rawPlaces);
  const catalogIds = rawPlaces
    .map((place) => place.place_id)
    .filter((placeId) => placeId);

  const orphans = dbx.places
    .find({ place_id: { $nin: catalogIds } }, { place_id: 1, name: 1, _id: 0 })
    .toArray();

  const deleteResult = dbx.places.deleteMany({ place_id: { $nin: catalogIds } });

  results.removed = deleteResult.deletedCount;
  results.removedPlaces = orphans.map((place) => ({
    place_id: place.place_id,
    name: place.name,
  }));

  return results;
}
