import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// lugares-lib.js is a mongosh script: it pulls its helpers in with load() and defines globals instead of exporting.
const seedDir = path.resolve(__dirname, "../../../scripts/seed");
const runScript = (file: string) => vm.runInThisContext(fs.readFileSync(path.join(seedDir, path.basename(file)), "utf8"), { filename: file });
(globalThis as Record<string, unknown>).load = runScript;
process.env.LUGARES_INFERENCE_PATH = path.join(seedDir, "lugares-inference.js");
runScript("lugares-lib.js");
const syncPlaces = (globalThis as Record<string, unknown>).syncPlaces as (dbx: unknown, raw: unknown[]) => { removed: number; removedPlaces: Array<{ place_id: string }> };

type Doc = { place_id: string; name: string; source?: string; zanzar?: { checkInCount: number } };

/** Just enough of the mongosh collection API for syncPlaces. */
function fakeDb(docs: Doc[]) {
    const matches = (doc: Doc, filter: Record<string, any>) => {
        if (filter.place_id?.$nin && filter.place_id.$nin.includes(doc.place_id)) return false;
        if (filter.place_id?.$in && !filter.place_id.$in.includes(doc.place_id)) return false;
        if (typeof filter.place_id === "string" && filter.place_id !== doc.place_id) return false;
        if (filter.source?.$ne !== undefined && doc.source === filter.source.$ne) return false;
        return true;
    };
    return {
        docs,
        places: {
            findOne: (filter: Record<string, any>) => docs.find((doc) => matches(doc, filter)) ?? null,
            updateOne: (filter: Record<string, any>, update: { $set: Doc }) => {
                const existing = docs.find((doc) => doc.place_id === filter.place_id);
                if (existing) { Object.assign(existing, update.$set); return { upsertedCount: 0, modifiedCount: 1 }; }
                docs.push({ ...update.$set, place_id: filter.place_id });
                return { upsertedCount: 1, modifiedCount: 0 };
            },
            countDocuments: (filter: Record<string, any> = {}) => docs.filter((doc) => matches(doc, filter)).length,
            find: (filter: Record<string, any>) => ({ toArray: () => docs.filter((doc) => matches(doc, filter)) }),
            deleteMany: (filter: Record<string, any>) => {
                const before = docs.length;
                for (let i = docs.length - 1; i >= 0; i--) if (matches(docs[i]!, filter)) docs.splice(i, 1);
                return { deletedCount: before - docs.length };
            },
        },
    };
}

const catalogEntry = (id: string) => ({ place_id: id, name: id, types: ["cafe"], geometry: { location: { lat: -25.4, lng: -49.2 } } });

describe("syncPlaces", () => {
    it("removes places that left the catalog but keeps community places", () => {
        const db = fakeDb([
            { place_id: "ChIJ1", name: "A", zanzar: { checkInCount: 0 } },
            { place_id: "ChIJ2", name: "B", zanzar: { checkInCount: 0 } },
            { place_id: "osm:node/9", name: "Community", source: "community", zanzar: { checkInCount: 0 } },
        ]);

        const result = syncPlaces(db, [catalogEntry("ChIJ1")]);

        expect(result.removedPlaces.map((p) => p.place_id)).toEqual(["ChIJ2"]);
        expect(db.docs.map((d) => d.place_id).sort()).toEqual(["ChIJ1", "osm:node/9"]);
    });

    it("does not count community places when checking the catalog was not truncated", () => {
        const catalogPlaces = Array.from({ length: 10 }, (_, i): Doc => ({ place_id: `ChIJ${i}`, name: `P${i}`, zanzar: { checkInCount: 0 } }));
        const community = Array.from({ length: 30 }, (_, i): Doc => ({ place_id: `osm:node/${i}`, name: `C${i}`, source: "community", zanzar: { checkInCount: 0 } }));
        const db = fakeDb([...catalogPlaces, ...community]);

        // 10 catalog entries out of 10 catalog places: fine. Counting the 30 community places would make this abort.
        expect(() => syncPlaces(db, catalogPlaces.map((p) => catalogEntry(p.place_id)))).not.toThrow();
        expect(db.docs).toHaveLength(40);
    });
});
