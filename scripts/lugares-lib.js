/**
 * Lógica compartilhada: lugares.json → documento MongoDB `places`.
 * Usado por seed e sync-from-github (mongosh load()).
 */

const categoryRules = [
  { types: ['museum'], category: 'museum', stampId: 'stamp_museum' },
  { types: ['park', 'amusement_park'], category: 'park', stampId: 'stamp_park' },
  { types: ['restaurant'], category: 'restaurant', stampId: 'stamp_restaurant' },
  { types: ['bar', 'night_club'], category: 'bar', stampId: 'stamp_bar' },
  { types: ['cafe', 'bakery'], category: 'cafe', stampId: 'stamp_cafe' },
  { types: ['historic', 'church', 'place_of_worship'], category: 'historic', stampId: 'stamp_historic' },
];

function inferZanzar(types) {
  const set = new Set(types || []);
  for (const rule of categoryRules) {
    if (rule.types.some((type) => set.has(type))) {
      return { category: rule.category, stampId: rule.stampId };
    }
  }
  return { category: 'tourist', stampId: 'stamp_tourist' };
}

function stripProxyUrl(photos) {
  if (!Array.isArray(photos)) return photos;
  return photos.map(({ proxy_url, ...photo }) => photo);
}

/**
 * Monta documento `places` para upsert.
 * Preserva contadores/tags Zanzar em updates (check-ins, ratings).
 */
function buildPlaceDocument(raw, existing) {
  const now = new Date();
  const { category, stampId } = inferZanzar(raw.types);
  const addedAt = existing?.added_at
    ? existing.added_at
    : raw.added_at
      ? new Date(raw.added_at)
      : now;

  const updatedAt = raw.updated_at ? new Date(raw.updated_at) : now;

  const existingZanzar = existing?.zanzar;

  return {
    ...raw,
    photos: stripProxyUrl(raw.photos),
    zanzar: {
      category,
      stampId,
      tags: existingZanzar?.tags ?? [],
      checkInCount: existingZanzar?.checkInCount ?? 0,
      impressionCounts: existingZanzar?.impressionCounts ?? {},
    },
    added_at: addedAt,
    updated_at: updatedAt,
  };
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
    const doc = buildPlaceDocument(raw, existing);
    const op = dbx.places.updateOne(
      { place_id: doc.place_id },
      { $set: doc },
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
