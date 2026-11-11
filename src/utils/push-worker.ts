import { UserModel } from "../models/user.model";
import { checkInRepository } from "../modules/checkin/checkin.repository";
import { pushService } from "./push-notifications";
import { logger } from "./logger";
import { userRepository } from "../modules/users/user.repository";

const log = logger.child({ module: "push", layer: "worker" });

/**
 * How long without a check-in before we nudge the user (rolling window).
 * Default 3 days; overridable via PUSH_INACTIVITY_DAYS.
 */
const INACTIVITY_DAYS = Number(process.env.PUSH_INACTIVITY_DAYS ?? 3);

/**
 * Minimum time between nudge pushes to the same user (rolling window).
 * Default 7 days; overridable via PUSH_INACTIVITY_COOLDOWN_DAYS.
 */
const INACTIVITY_COOLDOWN_DAYS = Number(process.env.PUSH_INACTIVITY_COOLDOWN_DAYS ?? 7);

const NOW = () => new Date();

/**
 * Finds users with a device token who haven't checked in in `INACTIVITY_DAYS` days
 * and haven't been nudged in `INACTIVITY_COOLDOWN_DAYS` days, then sends them a push.
 */
export async function sendInactivityNudges(): Promise<void> {
    const now = NOW();
    const inactivityCutoff = new Date(now.getTime() - INACTIVITY_DAYS * 24 * 3_600_000);
    const cooldownCutoff = new Date(now.getTime() - INACTIVITY_COOLDOWN_DAYS * 24 * 3_600_000);

    // Users who have a device token but haven't been nudged recently and haven't checked in recently.
    const users = await UserModel.find({
        deviceToken: { $exists: true, $nin: [null, ""] },
        $and: [
            {
                $or: [
                    { lastCheckInAt: { $exists: false } },
                    { lastCheckInAt: { $lt: inactivityCutoff } },
                ],
            },
            {
                $or: [
                    { lastPushNudgeAt: { $exists: false } },
                    { lastPushNudgeAt: { $lt: cooldownCutoff } },
                ],
            },
        ],
    }).select("_id deviceToken username lastCheckInAt lastPushNudgeAt").lean();

    log.info({ userCount: users.length, inactivityDays: INACTIVITY_DAYS }, "Checking users for inactivity nudges");

    for (const user of users) {
        const userId = user._id?.toString();
        const deviceToken = user.deviceToken;
        if (!userId || !deviceToken) continue;

        // Double-check with the check-in repository (more accurate than the denormalized field).
        const recentCheckIns = await checkInRepository.listLatestByUser(userId, 1);
        const recentCheckIn = recentCheckIns[0];
        if (recentCheckIn && recentCheckIn.datetime >= inactivityCutoff) {
            continue; // user checked in recently, skip
        }

        const result = await pushService.sendToDevice(deviceToken, {
            title: "Sinta falta de algum lugar?",
            body: "Você não faz check-in há alguns dias. Tem lugares novos perto de você esperando.",
            sound: "default",
        });

        if (result.sent) {
            // Record the nudge time so we don't repeat it during the cooldown window.
            await UserModel.updateOne({ _id: userId }, { $set: { lastPushNudgeAt: now } });
            log.info({ userId }, "Inactivity nudge sent");
        } else if (result.error === "device_token_invalid") {
            // APNs says the device token is dead: remove it so we stop pushing.
            await userRepository.deleteDeviceToken(userId);
            log.info({ userId }, "Removed invalid device token");
        } else {
            log.warn({ userId, error: result.error }, "Inactivity nudge failed");
        }
    }
}

/**
 * Finds users with an active itinerary that has incomplete stops and nudges them
 * to finish it. Runs independently of inactivity nudges.
 */
export async function sendUnfinishedItineraryNudges(): Promise<void> {
    const now = NOW();
    const cooldownCutoff = new Date(now.getTime() - INACTIVITY_COOLDOWN_DAYS * 24 * 3_600_000);

    const users = await UserModel.find({
        deviceToken: { $exists: true, $nin: [null, ""] },
        activeItinerary: { $ne: null },
        $or: [
            { lastPushNudgeAt: { $exists: false } },
            { lastPushNudgeAt: { $lt: cooldownCutoff } },
        ],
    }).select("_id deviceToken username activeItinerary lastPushNudgeAt").lean();

    log.info({ userCount: users.length }, "Checking users for unfinished itinerary nudges");

    for (const user of users) {
        const userId = user._id?.toString();
        const deviceToken = user.deviceToken;
        if (!userId || !deviceToken) continue;

        const remaining = user.activeItinerary?.places.filter((place) => !place.isCompleted).length ?? 0;
        if (remaining === 0) continue;

        const stops = remaining === 1 ? "1 parada" : `${remaining} paradas`;

        const result = await pushService.sendToDevice(deviceToken, {
            title: "Seu roteiro está esperando",
            body: `Faltam ${stops} no seu roteiro. Que tal continuar hoje?`,
            sound: "default",
        });

        if (result.sent) {
            await UserModel.updateOne({ _id: userId }, { $set: { lastPushNudgeAt: now } });
            log.info({ userId }, "Unfinished itinerary nudge sent");
        } else {
            log.warn({ userId, error: result.error }, "Unfinished itinerary nudge failed");
        }
    }
}

export const pushWorker = {
    intervalMs: 60 * 60 * 1000, // every hour
    timer: null as NodeJS.Timeout | null,
    running: false,

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => void this.tick(), this.intervalMs);
        this.timer.unref();
        void this.tick();
    },

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    },

    async tick() {
        if (this.running) return;
        this.running = true;
        try {
            await sendInactivityNudges();
            await sendUnfinishedItineraryNudges();
        } catch (err) {
            log.error({ err }, "Push worker tick failed");
        } finally {
            this.running = false;
        }
    },
};
