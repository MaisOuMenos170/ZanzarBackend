/**
 * Backfill geoLocation a partir de geometry.location (Google Places → GeoJSON Point).
 *
 * Rodar com:
 *   mongosh "$MONGODB_URI" --file scripts/migrations/migrate-places-geolocation.js
 */

const dbName = 'Zanzardb';
const dbx = db.getSiblingDB(dbName);

function buildGeoLocation(lat, lng) {
  return { type: 'Point', coordinates: [lng, lat] };
}

const cursor = dbx.places.find({
  'geometry.location.lat': { $exists: true },
  'geometry.location.lng': { $exists: true },
});

let updated = 0;
let skipped = 0;

cursor.forEach((doc) => {
  const lat = doc.geometry.location.lat;
  const lng = doc.geometry.location.lng;
  const geoLocation = buildGeoLocation(lat, lng);

  const existing = doc.geoLocation;
  const sameCoords =
    existing?.type === 'Point' &&
    existing.coordinates?.[0] === lng &&
    existing.coordinates?.[1] === lat;

  if (sameCoords) {
    skipped += 1;
    return;
  }

  const result = dbx.places.updateOne({ _id: doc._id }, { $set: { geoLocation } });
  if (result.modifiedCount === 1) updated += 1;
});

print(JSON.stringify({
  database: dbName,
  updated,
  skipped,
  total: dbx.places.countDocuments(),
  withGeoLocation: dbx.places.countDocuments({ geoLocation: { $exists: true } }),
}));
