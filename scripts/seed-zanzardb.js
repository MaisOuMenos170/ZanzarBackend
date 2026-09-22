/**
 * Seed inicial do Zanzardb: stamp_catalog + places (lugares.json).
 *
 * Rodar:
 *   npm run seed
 */

const dbName = 'Zanzardb';
const dbx = db.getSiblingDB(dbName);
const rootDir = process.env.SEED_ROOT_DIR || '.';

const stampCatalog = [
  { stampId: 'stamp_museum', stampType: 'museum', label: 'Museu', imageUrl: '/assets/stamps/museum.png', sortOrder: 1, isActive: true },
  { stampId: 'stamp_park', stampType: 'park', label: 'Parque', imageUrl: '/assets/stamps/park.png', sortOrder: 2, isActive: true },
  { stampId: 'stamp_restaurant', stampType: 'restaurant', label: 'Restaurante', imageUrl: '/assets/stamps/restaurant.png', sortOrder: 3, isActive: true },
  { stampId: 'stamp_bar', stampType: 'bar', label: 'Bar', imageUrl: '/assets/stamps/bar.png', sortOrder: 4, isActive: true },
  { stampId: 'stamp_cafe', stampType: 'cafe', label: 'Café', imageUrl: '/assets/stamps/cafe.png', sortOrder: 5, isActive: true },
  { stampId: 'stamp_historic', stampType: 'historic', label: 'Histórico', imageUrl: '/assets/stamps/historic.png', sortOrder: 6, isActive: true },
  { stampId: 'stamp_tourist', stampType: 'tourist', label: 'Turismo', imageUrl: '/assets/stamps/tourist.png', sortOrder: 7, isActive: true },
];

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

function loadPlaces() {
  const path = `${rootDir}/data/lugares.json`;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function enrichPlace(raw) {
  const now = new Date();
  const { category, stampId } = inferZanzar(raw.types);
  const addedAt = raw.added_at ? new Date(raw.added_at) : now;

  return {
    ...raw,
    photos: stripProxyUrl(raw.photos),
    zanzar: {
      category,
      stampId,
      tags: [],
      checkInCount: 0,
      impressionCounts: {},
    },
    added_at: addedAt,
    updated_at: raw.updated_at ? new Date(raw.updated_at) : addedAt,
  };
}

const stampResults = stampCatalog.map((stamp) =>
  dbx.stamp_catalog.updateOne({ stampId: stamp.stampId }, { $set: stamp }, { upsert: true }),
);

const rawPlaces = loadPlaces();
const placeResults = rawPlaces.map((raw) => {
  const doc = enrichPlace(raw);
  return dbx.places.updateOne({ place_id: doc.place_id }, { $set: doc }, { upsert: true });
});

print(JSON.stringify({
  database: dbName,
  stampCatalog: {
    total: stampCatalog.length,
    upserted: stampResults.filter((r) => r.upsertedCount === 1).length,
    modified: stampResults.filter((r) => r.modifiedCount === 1).length,
  },
  places: {
    total: rawPlaces.length,
    upserted: placeResults.filter((r) => r.upsertedCount === 1).length,
    modified: placeResults.filter((r) => r.modifiedCount === 1).length,
  },
  counts: {
    stamp_catalog: dbx.stamp_catalog.countDocuments(),
    places: dbx.places.countDocuments(),
    users: dbx.users.countDocuments(),
    itineraries: dbx.itineraries.countDocuments(),
  },
}, null, 2));
