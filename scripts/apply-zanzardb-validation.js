/**
 * Aplica validators JSON Schema no Atlas (aba Validation).
 *
 * Rodar: npm run db:validate
 *
 * Também renomeia impressions → rating se ainda existir.
 */

load(process.env.ZANZAR_VALIDATORS_PATH);

const dbName = 'Zanzardb';
const dbx = db.getSiblingDB(dbName);

const renameResult = migrateImpressionsToRating(dbx);

const validationResults = Object.entries(ZANZARDB_VALIDATORS).map(([name, schema]) =>
  applyCollectionValidator(dbx, name, schema),
);

const legacyUserCount = dbx.users.countDocuments({
  $or: [{ name: { $exists: true } }, { role: { $exists: true } }],
});

print(JSON.stringify({
  database: dbName,
  rename: renameResult,
  validations: validationResults,
  collections: dbx.getCollectionNames().sort(),
  warnings: legacyUserCount > 0
    ? [
        `${legacyUserCount} documento(s) em users não seguem o molde (ex: name/role). Apague ou migre antes de inserir users válidos.`,
      ]
    : [],
}, null, 2));
