/**
 * Sincroniza places a partir de lugares.json (GitHub CacheGoogleMaps → Atlas).
 *
 * Chamado via: npm run sync:lugares
 * Requer env: LUGARES_JSON_PATH, LUGARES_LIB_PATH
 */

load(process.env.LUGARES_LIB_PATH);

const dbName = 'Zanzardb';
const dbx = db.getSiblingDB(dbName);
const jsonPath = process.env.LUGARES_JSON_PATH;
const sourceUrl =
  process.env.LUGARES_SOURCE_URL ||
  'https://raw.githubusercontent.com/MaisOuMenos170/CacheGoogleMaps/main/data/lugares.json';

if (!jsonPath) {
  throw new Error('LUGARES_JSON_PATH não definido');
}

const rawPlaces = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

if (!Array.isArray(rawPlaces)) {
  throw new Error('lugares.json deve ser um array JSON');
}

const placeResults = upsertPlaces(dbx, rawPlaces);

print(JSON.stringify({
  database: dbName,
  source: sourceUrl,
  syncedAt: new Date().toISOString(),
  places: placeResults,
  counts: {
    places: dbx.places.countDocuments(),
  },
}, null, 2));
