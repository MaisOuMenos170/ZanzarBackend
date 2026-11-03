import { randomUUID } from "node:crypto";
import type { UserPhoto } from "../../../models";
import { logger } from "../../../utils/logger";
import { getPhotoStorage, type PhotoStorage } from "../photo-storage";
import { userPhotoModerationRepository, userPhotoRepository, type ModerationUpdate } from "../user-photo.repository";
import { ContextLayer, DuplicateLayer, QualityLayer } from "./basic-layers";
import { FaceLayer } from "./face-layer";
import { VisionLayer, visionConfigFromEnv } from "./vision-layer";
import { decide, runLayerSafely, type LayerResult, type ModerationLayer } from "./moderation-layer";

const log = logger.child({ module: "userPhotos", layer: "moderation" });

/**
 * Layers every photo must pass to be approved without a human. The vision layer is required even while it is not
 * configured: until it is, every photo goes to the review queue instead of being approved on partial evidence.
 */
export const REQUIRED_LAYERS = ["quality", "duplicate", "faces", "context", "vision"];

export interface ModerationDependencies {
    layers: ModerationLayer[];
    storage: PhotoStorage | null;
    now: () => Date;
}

let visionLayerFactory: () => ModerationLayer | null = () => {
    const config = visionConfigFromEnv();
    return config ? new VisionLayer(config) : null;
};

/** Tests replace the vision layer with this. */
export function setVisionLayerFactory(factory: () => ModerationLayer | null) {
    visionLayerFactory = factory;
}

export function defaultModerationDependencies(): ModerationDependencies {
    const vision = visionLayerFactory();
    return {
        layers: [
            new QualityLayer(),
            new DuplicateLayer(),
            new FaceLayer(),
            new ContextLayer((userId) => userPhotoModerationRepository.authorHistory(userId)),
            ...(vision ? [vision] : []),
        ],
        storage: getPhotoStorage(),
        now: () => new Date(),
    };
}

async function publish(photo: UserPhoto, storage: PhotoStorage, jpeg: Buffer, thumbnail: Buffer) {
    // A photo approved again after re-moderation keeps its public names.
    const publicKey = photo.publicKey ?? `${randomUUID()}.jpg`;
    const publicThumbnailKey = photo.publicThumbnailKey ?? `${randomUUID()}.jpg`;
    if (!photo.publicKey) await storage.putPublic(publicKey, jpeg);
    if (!photo.publicThumbnailKey) await storage.putPublic(publicThumbnailKey, thumbnail);
    return { publicKey, publicThumbnailKey };
}

/** Runs every layer on one claimed photo, decides, and publishes it when approved. */
export async function moderatePhoto(photo: UserPhoto, deps: ModerationDependencies): Promise<UserPhoto["status"] | null> {
    const photoId = photo._id.toString();
    const now = deps.now();
    if (!deps.storage) {
        log.error({ photoId }, "No photo storage configured; leaving the photo pending");
        return null;
    }

    const [jpeg, thumbnail] = await Promise.all([deps.storage.getPrivate(photo.storageKey), deps.storage.getPrivate(photo.thumbnailKey)]);
    const results: LayerResult[] = await Promise.all(deps.layers.map((layer) => runLayerSafely(layer, { photo, jpeg, thumbnail })));
    const decision = decide(results, REQUIRED_LAYERS);

    const moderation = results.map((r) => ({ ...r, checkedAt: now }));
    let update: ModerationUpdate = { status: decision.status, moderation };
    if (decision.status === "approved") {
        update = { ...update, ...(await publish(photo, deps.storage, jpeg, thumbnail)), decidedAt: now, decidedBy: "system" };
    } else {
        update = { ...update, decisionReason: decision.reason, ...(decision.status === "rejected" ? { decidedAt: now, decidedBy: "system" } : {}) };
    }

    const applied = await userPhotoModerationRepository.applyModeration(photo._id, update);
    if (!applied) {
        log.warn({ photoId }, "Photo changed during moderation; result discarded");
        return null;
    }
    await userPhotoRepository.recordEvent({
        photoId: photo._id,
        placeId: photo.placeId,
        action: "moderated",
        actor: "system",
        fromStatus: "pending",
        toStatus: decision.status,
        details: {
            reason: decision.status === "approved" ? null : decision.reason,
            layers: results.map(({ layer, verdict, reason }) => ({ layer, verdict, reason })),
        },
    });
    log.info({ photoId, status: decision.status }, "Moderated user photo");
    return decision.status;
}

const STALLED_AFTER_MS = 10 * 60 * 1000;

/**
 * Polls the pending queue in this process. Light enough for Railway's 0.5 GB plan: the in-process layers use
 * sharp and a 1.2 MB face model; the vision model runs at the provider.
 */
export class ModerationWorker {
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    constructor(
        private readonly deps: () => ModerationDependencies = defaultModerationDependencies,
        private readonly intervalMs = 15_000,
    ) {}

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => void this.drain(), this.intervalMs);
        this.timer.unref();
        void this.drain();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Called right after an upload so the author does not wait for the next tick. */
    wake() {
        if (this.timer) void this.drain();
    }

    /** Processes pending photos until the queue is empty. Returns how many were processed. */
    async drain(): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        let processed = 0;
        try {
            const deps = this.deps();
            for (;;) {
                const photo = await userPhotoModerationRepository.claimNextPending(deps.now(), STALLED_AFTER_MS);
                if (!photo) break;
                try {
                    await moderatePhoto(photo, deps);
                } catch (err) {
                    // A run that breaks (storage down, a bug) hands the photo to a human; it is never approved by a crash.
                    log.error({ err, photoId: photo._id.toString() }, "Moderation run failed; sending the photo to review");
                    await userPhotoModerationRepository
                        .applyModeration(photo._id, { status: "needs_review", moderation: [], decisionReason: "layer_unavailable" })
                        .catch((applyErr) => log.error({ err: applyErr, photoId: photo._id.toString() }, "Could not mark the photo for review"));
                }
                processed++;
            }
        } catch (err) {
            log.error({ err }, "Moderation queue unavailable");
        } finally {
            this.running = false;
        }
        return processed;
    }
}

export const moderationWorker = new ModerationWorker();
