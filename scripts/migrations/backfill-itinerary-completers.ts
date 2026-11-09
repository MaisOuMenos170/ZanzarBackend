import "dotenv/config";
import type { Types } from "mongoose";
import { connectDatabase, disconnectDatabase } from "../../src/config/database";
import { RECENT_COMPLETERS_STORED } from "../../src/constants/avatar-highlights";
import { ItineraryModel } from "../../src/models/itinerary.model";
import { UserModel } from "../../src/models/user.model";

/**
 * Recalcula, a partir de `users.completedItineraries`, o que o app mostra em cada roteiro:
 *   - `completedCount`: usuários distintos que completaram (substitui o valor do seed);
 *   - `recentCompleters`: os últimos RECENT_COMPLETERS_STORED, uma conclusão por usuário (a mais recente).
 *
 *   npm run db:backfill:completers                 dry-run: só lê e imprime antes/depois
 *   npm run db:backfill:completers -- --apply      grava
 *
 * Conclusões cujo `itineraryTemplateId` não existe mais são casadas pelo `slug`; as que sobram são listadas.
 */
const apply = process.argv.slice(2).includes("--apply");

type Completion = { userId: Types.ObjectId; templateId: Types.ObjectId; slug?: string; completedAt: Date };

async function main() {
    await connectDatabase();
    try {
        const templates = await ItineraryModel.find({}, "slug completedCount recentCompleters").lean();
        const byId = new Map(templates.map((template) => [template._id.toString(), template]));
        const bySlug = new Map(templates.map((template) => [template.slug, template]));

        // templateId -> userId -> conclusão mais recente
        const latest = new Map<string, Map<string, { userId: Types.ObjectId; completedAt: Date }>>();
        let orphans = 0;

        const cursor = UserModel.aggregate<Completion>([
            { $unwind: "$completedItineraries" },
            {
                $project: {
                    _id: 0,
                    userId: "$_id",
                    templateId: "$completedItineraries.itineraryTemplateId",
                    slug: "$completedItineraries.slug",
                    completedAt: "$completedItineraries.completedAt",
                },
            },
        ]).cursor();

        for await (const completion of cursor) {
            const template = byId.get(completion.templateId.toString()) ?? (completion.slug ? bySlug.get(completion.slug) : undefined);
            if (!template) {
                orphans += 1;
                continue;
            }
            const key = template._id.toString();
            const users = latest.get(key) ?? new Map();
            const userKey = completion.userId.toString();
            const previous = users.get(userKey);
            if (!previous || previous.completedAt < completion.completedAt) {
                users.set(userKey, { userId: completion.userId, completedAt: completion.completedAt });
            }
            latest.set(key, users);
        }

        console.log(apply ? "Gravando:" : "[dry-run] Nada será gravado. Resultado previsto:");
        for (const template of templates) {
            const users = [...(latest.get(template._id.toString())?.values() ?? [])].sort(
                (a, b) => a.completedAt.getTime() - b.completedAt.getTime(),
            );
            const recentCompleters = users.slice(-RECENT_COMPLETERS_STORED);
            const before = `${template.completedCount} / ${template.recentCompleters?.length ?? 0} recentes`;
            console.log(`  ${template.slug}: ${before} -> ${users.length} / ${recentCompleters.length} recentes`);
            if (apply) {
                await ItineraryModel.updateOne(
                    { _id: template._id },
                    { $set: { completedCount: users.length, recentCompleters } },
                );
            }
        }
        if (orphans > 0) {
            console.log(`${orphans} conclusão(ões) sem roteiro correspondente (id e slug) foram ignoradas.`);
        }
        if (!apply) {
            console.log("Para gravar: npm run db:backfill:completers -- --apply");
        }
    } finally {
        await disconnectDatabase();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
