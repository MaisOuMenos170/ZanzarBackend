import type { UserPhoto } from "../../../models";

export type LayerVerdict = "pass" | "fail" | "doubt" | "error";

/**
 * Reasons a photo can be refused or held. They are stored as codes and the app turns them into plain language.
 * "Hard" reasons reject without a human; the rest only ever send the photo to review.
 */
export const HARD_REJECTION_REASONS = ["nudity", "violence", "low_quality"] as const;
export type ModerationReason =
    | (typeof HARD_REJECTION_REASONS)[number]
    | "minors"
    | "face_prominent"
    | "personal_data"
    | "offensive_text"
    | "watermark"
    | "not_the_place"
    | "possible_duplicate"
    | "low_trust"
    | "layer_unavailable";

export interface LayerResult {
    layer: string;
    verdict: LayerVerdict;
    reason?: ModerationReason;
    scores?: Record<string, unknown>;
}

export interface ModerationInput {
    photo: UserPhoto;
    /** The stored, metadata-free JPEG (at most 2048 px). */
    jpeg: Buffer;
    /** The 1024 px copy, cheaper to send to a vision model. */
    thumbnail: Buffer;
}

export interface ModerationLayer {
    readonly name: string;
    run(input: ModerationInput): Promise<LayerResult>;
}

/** Runs a layer and turns any exception into an `error` verdict: a broken layer must never approve. */
export async function runLayerSafely(layer: ModerationLayer, input: ModerationInput): Promise<LayerResult> {
    try {
        return await layer.run(input);
    } catch (err) {
        return { layer: layer.name, verdict: "error", reason: "layer_unavailable", scores: { message: (err as Error).message?.slice(0, 200) } };
    }
}

export type ModerationDecision =
    | { status: "approved" }
    | { status: "rejected"; reason: ModerationReason }
    | { status: "needs_review"; reason: ModerationReason };

/**
 * `approved` only when every layer passed; `rejected` only for a clear violation (a hard reason);
 * anything else, including a layer that failed to run or is missing, goes to a human.
 */
export function decide(results: LayerResult[], requiredLayers: string[]): ModerationDecision {
    const hard = results.find((r) => r.verdict === "fail" && r.reason && (HARD_REJECTION_REASONS as readonly string[]).includes(r.reason));
    if (hard?.reason) return { status: "rejected", reason: hard.reason };

    const missing = requiredLayers.find((name) => !results.some((r) => r.layer === name));
    if (missing) return { status: "needs_review", reason: "layer_unavailable" };

    const doubtful = results.find((r) => r.verdict !== "pass");
    if (doubtful) return { status: "needs_review", reason: doubtful.reason ?? "layer_unavailable" };

    return { status: "approved" };
}
