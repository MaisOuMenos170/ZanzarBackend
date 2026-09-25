import "dotenv/config";
import mongoose, { Model } from "mongoose";
import * as models from "../models";
import { schemaToJsonSchema } from "../db/mongoose-to-jsonschema";

/**
 * Gera o $jsonSchema de cada model Mongoose e aplica como validador no Atlas.
 *
 *   npm run db:validate        aplica no banco
 *   npm run db:validate:dry    só imprime os $jsonSchema, sem conectar
 */

const DB_NAME = process.env.MONGODB_DB || "Zanzardb";
const dryRun = process.argv.includes("--dry-run");

const allModels = Object.values(models).filter(
    (value): value is Model<any> => typeof (value as Model<any>)?.modelName === "string",
);

const validators = allModels.map((model) => ({
    collection: model.collection.name,
    validator: { $jsonSchema: schemaToJsonSchema(model.schema) },
}));

async function migrateImpressionsToRating(db: mongoose.mongo.Db) {
    const names = (await db.listCollections().toArray()).map((c) => c.name);
    if (!names.includes("impressions")) return { migrated: false, reason: "impressions_not_found" };
    if (names.includes("rating")) return { migrated: false, reason: "rating_already_exists" };
    await db.collection("impressions").rename("rating");
    return { migrated: true, from: "impressions", to: "rating" };
}

async function applyValidator(db: mongoose.mongo.Db, collection: string, validator: object) {
    const options = { validationLevel: "strict", validationAction: "error" };
    const exists = (await db.listCollections({ name: collection }).toArray()).length > 0;

    if (!exists) {
        await db.createCollection(collection, { validator, ...options });
        return { collection, action: "created_with_validator" };
    }

    try {
        await db.command({ collMod: collection, validator, ...options });
        return { collection, action: "collMod", ok: true };
    } catch (error) {
        return { collection, action: "collMod", ok: false, errMsg: (error as Error).message };
    }
}

async function main() {
    if (dryRun) {
        const output = Object.fromEntries(validators.map((v) => [v.collection, v.validator.$jsonSchema]));
        console.log(JSON.stringify(output, null, 2));
        return;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Defina MONGODB_URI.");

    await mongoose.connect(uri, { dbName: DB_NAME });
    const db = mongoose.connection.db;
    if (!db) throw new Error("Sem conexão com o banco.");

    const rename = await migrateImpressionsToRating(db);
    const results = [];
    for (const { collection, validator } of validators) {
        results.push(await applyValidator(db, collection, validator));
    }

    const legacyUserCount = await db.collection("users").countDocuments({
        $or: [{ name: { $exists: true } }, { role: { $exists: true } }],
    });

    console.log(
        JSON.stringify(
            {
                database: DB_NAME,
                rename,
                validations: results,
                warnings:
                    legacyUserCount > 0
                        ? [`${legacyUserCount} documento(s) em users não seguem o molde (ex: name/role). Apague ou migre antes de inserir users válidos.`]
                        : [],
            },
            null,
            2,
        ),
    );

    if (results.some((r) => r.ok === false)) process.exitCode = 1;
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
