/**
 * Seed inicial do Zanzardb: stamp_catalog + places (lugares.json local).
 *
 * Rodar: npm run seed
 */

load(process.env.LUGARES_LIB_PATH || `${process.env.SEED_ROOT_DIR || '.'}/scripts/seed/lugares-lib.js`);

const dbName = 'Zanzardb';
const dbx = db.getSiblingDB(dbName);
const rootDir = process.env.SEED_ROOT_DIR || '.';

const stampCatalog = [
  { stampId: 'stamp_restaurant', stampType: 'restaurant', label: 'Restaurante', imageUrl: '/assets/stamps/restaurant.png', sortOrder: 1, isActive: true },
  { stampId: 'stamp_bar', stampType: 'bar', label: 'Bar', imageUrl: '/assets/stamps/bar.png', sortOrder: 2, isActive: true },
  { stampId: 'stamp_cafe', stampType: 'cafe', label: 'Café', imageUrl: '/assets/stamps/cafe.png', sortOrder: 3, isActive: true },
  { stampId: 'stamp_museum', stampType: 'museum', label: 'Museu', imageUrl: '/assets/stamps/museum.png', sortOrder: 4, isActive: true },
  { stampId: 'stamp_park', stampType: 'park', label: 'Parque', imageUrl: '/assets/stamps/park.png', sortOrder: 5, isActive: true },
  { stampId: 'stamp_tourist', stampType: 'tourist', label: 'Ponto Turístico', imageUrl: '/assets/stamps/tourist.png', sortOrder: 6, isActive: true },
  { stampId: 'stamp_historic', stampType: 'historic', label: 'Histórico', imageUrl: '/assets/stamps/historic.png', sortOrder: 7, isActive: true },
  { stampId: 'stamp_curiosity', stampType: 'curiosity', label: 'Curiosidade', imageUrl: '/assets/stamps/curiosity.png', sortOrder: 8, isActive: true },
  { stampId: 'stamp_party', stampType: 'party', label: 'Festas', imageUrl: '/assets/stamps/party.png', sortOrder: 9, isActive: true },
];

const stampResults = stampCatalog.map((stamp) =>
  dbx.stamp_catalog.updateOne({ stampId: stamp.stampId }, { $set: stamp }, { upsert: true }),
);

const rawPlaces = JSON.parse(fs.readFileSync(`${rootDir}/data/lugares.json`, 'utf8'));
const placeResults = upsertPlaces(dbx, rawPlaces);

// Demo stats so nearby cards and place detail previews match design expectations.
const demoZanzarStatsByPlaceId = {
  ChIJp1_LiN_j3JQRUx7PRRpC7WQ: {
    checkInCount: 21,
    impressionCounts: { delighted: 3, happy: 5, nauseated: 2, sad: 4, sleepy: 7 },
  },
  ChIJNWbp1QDl3JQRVFbc_cVeLRo: {
    checkInCount: 14,
    impressionCounts: { delighted: 2, happy: 4, nauseated: 1, sad: 3, sleepy: 4 },
  },
};

const demoStatsResults = Object.entries(demoZanzarStatsByPlaceId).map(([placeId, stats]) =>
  dbx.places.updateOne(
    { place_id: placeId },
    {
      $set: {
        'zanzar.checkInCount': stats.checkInCount,
        'zanzar.impressionCounts': stats.impressionCounts,
      },
    },
  ),
);

print(JSON.stringify({
  database: dbName,
  stampCatalog: {
    total: stampCatalog.length,
    upserted: stampResults.filter((r) => r.upsertedCount === 1).length,
    modified: stampResults.filter((r) => r.modifiedCount === 1).length,
  },
  places: placeResults,
  demoZanzarStats: {
    configured: Object.keys(demoZanzarStatsByPlaceId).length,
    matched: demoStatsResults.filter((result) => result.matchedCount === 1).length,
  },
  counts: {
    stamp_catalog: dbx.stamp_catalog.countDocuments(),
    places: dbx.places.countDocuments(),
    users: dbx.users.countDocuments(),
    itineraries: dbx.itineraries.countDocuments(),
  },
}, null, 2));
