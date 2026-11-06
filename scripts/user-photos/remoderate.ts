import "dotenv/config";
import { connectDatabase, disconnectDatabase } from "../../src/config/database";
import { UserPhotoModel } from "../../src/models";
import { userPhotoModerationRepository } from "../../src/modules/user-photos/user-photo.repository";
import { moderationWorker } from "../../src/modules/user-photos/moderation/moderation.service";

/**
 * Sends user photos back through automatic moderation, after a threshold or a layer changes.
 *
 *   npm run photos:remoderate                          needs_review e rejected decididas pelo sistema
 *   npm run photos:remoderate -- --status needs_review só a fila de revisão
 *   npm run photos:remoderate -- --include-approved    também as aprovadas (ficam ocultas até a nova decisão)
 *   npm run photos:remoderate -- --dry-run             só conta, não altera
 *
 * Decisões tomadas por um admin nunca são refeitas.
 */
const args = process.argv.slice(2);
const statusArg = args.includes("--status") ? args[args.indexOf("--status") + 1] : "needs_review,rejected";
const statuses = statusArg.split(",").filter(Boolean);
if (args.includes("--include-approved")) statuses.push("approved");
const dryRun = args.includes("--dry-run");

async function main() {
    await connectDatabase();
    try {
        if (dryRun) {
            const count = await UserPhotoModel.countDocuments({ status: { $in: statuses }, decidedBy: { $ne: "admin" } });
            console.log(`[dry-run] ${count} foto(s) com status ${statuses.join(", ")} voltariam para a fila.`);
            return;
        }
        const requeued = await userPhotoModerationRepository.requeue(statuses, true);
        console.log(`${requeued} foto(s) voltaram para a fila. Processando...`);
        const processed = await moderationWorker.drain();
        console.log(`${processed} foto(s) processadas.`);
    } finally {
        await disconnectDatabase();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
