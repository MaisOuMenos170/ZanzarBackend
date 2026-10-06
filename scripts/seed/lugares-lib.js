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

const PLACE_FIELD_KEYS = [
  'place_id',
  'name',
  'formatted_address',
  'address_components',
  'geometry',
  'types',
  'business_status',
  'editorial_summary',
  'opening_hours',
  'formatted_phone_number',
  'international_phone_number',
  'website',
  'url',
  'rating',
  'user_ratings_total',
  'price_level',
  'photos',
  'added_at',
  'updated_at',
];

function pickPlaceFields(raw) {
  const picked = {};
  for (const key of PLACE_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      picked[key] = raw[key];
    }
  }
  return picked;
}

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

function normalizeNickname(nickname) {
  if (nickname == null) return '';
  return String(nickname).trim();
}

/**
 * Monta documento `places` para upsert.
 * Tags e nickname vêm do catálogo (lugares.json).
 * Preserva contadores Zanzar gerados pelo app (check-ins, impressões).
 */
function buildPlaceDocument(raw, existing) {
  const now = new Date();
  const { tags: catalogTags, nickname, ..._ignored } = raw;
  const placeFields = pickPlaceFields(raw);
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

  const trimmedNickname = normalizeNickname(nickname);
  if (trimmedNickname !== '') {
    doc.nickname = trimmedNickname;
  }

  return doc;
}

function buildPlaceUpdate(raw, existing) {
  const doc = buildPlaceDocument(raw, existing);
  const update = { $set: doc };
  const unset = {};

  if (normalizeNickname(raw.nickname) === '') {
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
    syncedPlaceIds: [],
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

    results.syncedPlaceIds.push(raw.place_id);
  }

  return results;
}

/**
 * Sincronização completa: upsert do catálogo + remoção de lugares que saíram do JSON.
 * Guardrails: aborta com catálogo vazio/truncado ou erros de upsert; não remove lugares com check-ins.
 */
function syncPlaces(dbx, rawPlaces) {
  const results = upsertPlaces(dbx, rawPlaces);

  if (results.errors.length > 0) {
    throw new Error(
      `Sync aborted: ${results.errors.length} place(s) missing place_id — refusing orphan cleanup`,
    );
  }

  const catalogIds = results.syncedPlaceIds;

  if (catalogIds.length === 0) {
    throw new Error('Sync aborted: catalog is empty — refusing to delete all places');
  }

  const currentCount = dbx.places.countDocuments();
  if (currentCount > 0) {
    const minimumCatalogSize = Math.max(1, Math.floor(currentCount * 0.8));
    if (catalogIds.length < minimumCatalogSize) {
      throw new Error(
        `Sync aborted: catalog has ${catalogIds.length} places, expected at least ${minimumCatalogSize}`,
      );
    }
  }

  const orphans = dbx.places
    .find(
      { place_id: { $nin: catalogIds } },
      { place_id: 1, name: 1, 'zanzar.checkInCount': 1, _id: 0 },
    )
    .toArray();

  const removableOrphans = orphans.filter(
    (place) => (place.zanzar?.checkInCount ?? 0) === 0,
  );
  const skippedOrphans = orphans.filter(
    (place) => (place.zanzar?.checkInCount ?? 0) > 0,
  );

  const deleteResult =
    removableOrphans.length > 0
      ? dbx.places.deleteMany({
          place_id: { $in: removableOrphans.map((place) => place.place_id) },
        })
      : { deletedCount: 0 };

  results.removed = deleteResult.deletedCount;
  results.removedPlaces = removableOrphans.map((place) => ({
    place_id: place.place_id,
    name: place.name,
  }));
  results.skippedOrphans = skippedOrphans.map((place) => ({
    place_id: place.place_id,
    name: place.name,
    checkInCount: place.zanzar?.checkInCount ?? 0,
  }));

  return results;
}
