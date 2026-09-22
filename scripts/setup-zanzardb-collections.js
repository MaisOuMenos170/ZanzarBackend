/**
 * Cria collections e índices do MVP Zanzar no database Zanzardb.
 *
 * Rodar com:
 *   mongosh "$MONGODB_URI" --file scripts/setup-zanzardb-collections.js
 *
 * Ou colar no Atlas → ClusterZanzar → Browse Collections → _MONGOSH.
 *
 * Schema: docs/banco-de-dados/schema-proposto.md (agent store / ZanzarProjetinho)
 */

const dbName = 'Zanzardb';
const dbx = db.getSiblingDB(dbName);

const collections = [
  'users',
  'places',
  'stamp_catalog',
  'itineraries',
  'checkins',
  'rating',
  'sync_mutations',
];

const created = [];
const existing = [];

for (const name of collections) {
  if (dbx.getCollectionNames().includes(name)) {
    existing.push(name);
  } else {
    dbx.createCollection(name);
    created.push(name);
  }
}

const indexResults = [];

function safeIndex(coll, keys, options = {}) {
  try {
    const name = dbx[coll].createIndex(keys, options);
    indexResults.push({ coll, name, ok: true });
  } catch (error) {
    indexResults.push({ coll, keys, ok: false, error: error.message });
  }
}

// users
safeIndex('users', { email: 1 }, { unique: true, name: 'users_email_unique' });
safeIndex('users', { username: 1 }, { unique: true, name: 'users_username_unique' });

// places — geo 2dsphere fica para quando migrarmos geometry para GeoJSON
safeIndex('places', { place_id: 1 }, { unique: true, name: 'places_place_id_unique' });
safeIndex('places', { updated_at: 1 }, { name: 'places_updated_at' });
safeIndex('places', { 'zanzar.category': 1 }, { name: 'places_zanzar_category' });
safeIndex('places', { 'zanzar.tags': 1 }, { name: 'places_zanzar_tags' });

// stamp_catalog
safeIndex('stamp_catalog', { stampType: 1 }, { unique: true, name: 'stamp_catalog_stampType_unique' });
safeIndex('stamp_catalog', { stampId: 1 }, { unique: true, name: 'stamp_catalog_stampId_unique' });

// itineraries (templates curados)
safeIndex('itineraries', { slug: 1 }, { unique: true, name: 'itineraries_slug_unique' });
safeIndex('itineraries', { isPublished: 1, category: 1 }, { name: 'itineraries_published_category' });

// checkins
safeIndex('checkins', { userId: 1, placeId: 1 }, { unique: true, name: 'checkins_user_place_unique' });
safeIndex('checkins', { clientMutationId: 1 }, { unique: true, name: 'checkins_clientMutationId_unique' });
safeIndex('checkins', { userId: 1, datetime: -1 }, { name: 'checkins_user_datetime' });

// rating (Rating / Reações no diagrama)
safeIndex('rating', { userId: 1, placeId: 1 }, { unique: true, name: 'rating_user_place_unique' });
safeIndex('rating', { placeId: 1, impressionTag: 1 }, { name: 'rating_place_tag' });

// sync_mutations (idempotência offline)
safeIndex('sync_mutations', { clientMutationId: 1 }, { unique: true, name: 'sync_mutations_clientMutationId_unique' });

print(JSON.stringify({
  database: dbName,
  created,
  existing,
  collections: dbx.getCollectionNames().sort(),
  indexResults,
}, null, 2));
