import { MIN_BRIGHTNESS, MIN_SHARPNESS } from "../../../constants/user-photos";
import { measureQuality } from "../image-processing";
import type { LayerResult, ModerationInput, ModerationLayer } from "./moderation-layer";

/** Too blurry or too dark to show. Recomputed here so a threshold change applies when photos are re-moderated. */
export class QualityLayer implements ModerationLayer {
    readonly name = "quality";

    async run({ jpeg }: ModerationInput): Promise<LayerResult> {
        const { brightness, sharpness } = await measureQuality(jpeg);
        const bad = sharpness < MIN_SHARPNESS || brightness < MIN_BRIGHTNESS;
        return {
            layer: this.name,
            verdict: bad ? "fail" : "pass",
            reason: bad ? "low_quality" : undefined,
            scores: { brightness: Number(brightness.toFixed(1)), sharpness: Number(sharpness.toFixed(1)) },
        };
    }
}

/** Exact and near-identical copies are refused at upload; this holds the borderline ones for a human. */
export class DuplicateLayer implements ModerationLayer {
    readonly name = "duplicate";

    async run({ photo }: ModerationInput): Promise<LayerResult> {
        return photo.similarToPhotoId
            ? { layer: this.name, verdict: "doubt", reason: "possible_duplicate", scores: { similarToPhotoId: photo.similarToPhotoId.toString() } }
            : { layer: this.name, verdict: "pass" };
    }
}

export interface AuthorHistory {
    accountCreatedAt: Date | null;
    rejectedPhotos: number;
    removedPhotos: number;
}

export const NEW_ACCOUNT_DAYS = 7;

/**
 * Trust in the author. A verified check-in already proves they were at the place; a brand-new account,
 * or one whose photos were refused or taken down before, has its photos looked at by a human.
 */
export class ContextLayer implements ModerationLayer {
    readonly name = "context";

    constructor(
        private readonly history: (userId: string) => Promise<AuthorHistory>,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async run({ photo }: ModerationInput): Promise<LayerResult> {
        const { accountCreatedAt, rejectedPhotos, removedPhotos } = await this.history(photo.userId.toString());
        const ageDays = accountCreatedAt ? (this.now().getTime() - accountCreatedAt.getTime()) / 86_400_000 : 0;
        const lowTrust = removedPhotos > 0 || rejectedPhotos >= 2 || (ageDays < NEW_ACCOUNT_DAYS && !photo.isVerifiedCheckIn);
        return {
            layer: this.name,
            verdict: lowTrust ? "doubt" : "pass",
            reason: lowTrust ? "low_trust" : undefined,
            scores: { accountAgeDays: Math.floor(ageDays), rejectedPhotos, removedPhotos, isVerifiedCheckIn: photo.isVerifiedCheckIn },
        };
    }
}
