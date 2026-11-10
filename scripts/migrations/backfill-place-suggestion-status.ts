import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../../src/config/database";
import { PlaceSuggestionModel } from "../../src/models/place-suggestion.model";

/**
 * Sugestões feitas antes da moderação não têm `status`. Esta migração marca todas como `needs_review`
 * (com `decisionReason: "manual_entry"`), para uma pessoa olhar cada uma uma vez na fila do /admin.
 *
 *   npm run db:backfill:suggestions                dry-run: só conta
 *   npm run db:backfill:suggestions -- --apply     grava
 */
const apply = process.argv.slice(2).includes("--apply");

async function main() {
    await connectDatabase();
    try {
        const filter = { status: { $exists: false } };
        const pending = await PlaceSuggestionModel.countDocuments(filter);
        console.log(`${pending} sugestão(ões) sem status.`);
        if (!apply) {
            console.log("Dry-run: nada foi gravado. Rode com --apply para gravar.");
            return;
        }
        const result = await PlaceSuggestionModel.updateMany(filter, { $set: { status: "needs_review", decisionReason: "manual_entry" } });
        console.log(`${result.modifiedCount} atualizada(s).`);
    } finally {
        await disconnectDatabase();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
