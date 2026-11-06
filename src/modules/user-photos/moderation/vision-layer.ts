import { logger } from "../../../utils/logger";
import type { LayerResult, ModerationInput, ModerationLayer, ModerationReason } from "./moderation-layer";

const log = logger.child({ module: "userPhotos", layer: "vision" });

/**
 * Questions put to the vision model. Measured with Mistral Small 3.1 on the moderation sample
 * (docs/fotos-de-usuario-decisao.md): its own "low quality" answer is ignored (3 false alarms; the in-process
 * quality layer is measured better), everything else is used.
 */
export const VISION_PROMPT = `You moderate photos that users upload of a venue (bar, restaurant, cafe, park, museum) in a city guide app.
Answer ONLY with a JSON object with these boolean fields and a short reason:
{"shows_venue": true if the photo mainly shows a venue (facade with sign, interior, food or drink served, park or landmark) rather than just a road, cars or people,
 "person_face_prominent": true if a person's face is large and recognizable in the foreground (selfie, portrait, close group),
 "minors_visible": true if children or teenagers are clearly visible,
 "nudity_or_sexual": true if there is nudity or sexual content,
 "violence_or_gore": true if there is violence, blood, gore or weapons pointed at people,
 "personal_data_visible": true if a readable license plate, ID document, phone number, email or a screenshot of a phone/app is visible,
 "offensive_text": true if there is insulting, hateful or obscene text,
 "watermark_or_credit": true if there is a watermark, copyright notice or another person's handle/credit overlaid,
 "low_quality": true if the photo is very blurry or too dark to see,
 "reason": "max 15 words"}`;

/** Flag → reason, in the order a reviewer should see them. Any raised flag sends the photo to a human. */
const FLAGS: [string, ModerationReason][] = [
    ["nudity_or_sexual", "nudity"],
    ["violence_or_gore", "violence"],
    ["minors_visible", "minors"],
    ["personal_data_visible", "personal_data"],
    ["offensive_text", "offensive_text"],
    ["watermark_or_credit", "watermark"],
    ["person_face_prominent", "face_prominent"],
];

export interface VisionConfig {
    /** An OpenAI-compatible chat completions URL: Cloudflare Workers AI in production, Ollama in development. */
    url: string;
    apiKey?: string;
    model: string;
    timeoutMs: number;
}

/** Reads `VISION_API_URL`, `VISION_API_KEY` (optional for a local Ollama) and `VISION_MODEL`. */
export function visionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VisionConfig | null {
    const url = env.VISION_API_URL?.trim();
    const model = env.VISION_MODEL?.trim();
    if (!url || !model) return null;
    return { url, model, apiKey: env.VISION_API_KEY?.trim() || undefined, timeoutMs: Number(env.VISION_TIMEOUT_MS) || 90_000 };
}

/** Pulls the first JSON object out of a model answer (some models wrap it in prose or a code fence). */
export function parseVisionAnswer(text: string): Record<string, unknown> | null {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        const value = JSON.parse(text.slice(start, end + 1));
        return value && typeof value === "object" ? value : null;
    } catch {
        return null;
    }
}

export function verdictFromAnswer(answer: Record<string, unknown>): Omit<LayerResult, "layer"> {
    const scores = { ...answer };
    if (typeof answer.shows_venue !== "boolean") {
        return { verdict: "error", reason: "layer_unavailable", scores };
    }
    const raised = FLAGS.find(([flag]) => answer[flag] === true);
    if (raised) return { verdict: "doubt", reason: raised[1], scores };
    if (!answer.shows_venue) return { verdict: "doubt", reason: "not_the_place", scores };
    return { verdict: "pass", scores };
}

/**
 * Asks a vision-language model about the 1024 px copy of the photo. The photo goes to the provider, so the photo
 * terms must say so (App Review 5.1.2(i)). Never approves on its own: a raised flag means human review.
 */
export class VisionLayer implements ModerationLayer {
    readonly name = "vision";

    constructor(private readonly config: VisionConfig, private readonly fetchImpl: typeof fetch = fetch) {}

    async run({ thumbnail }: ModerationInput): Promise<LayerResult> {
        const response = await this.fetchImpl(this.config.url, {
            method: "POST",
            signal: AbortSignal.timeout(this.config.timeoutMs),
            headers: {
                "Content-Type": "application/json",
                ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
            },
            body: JSON.stringify({
                model: this.config.model,
                temperature: 0,
                max_tokens: 300,
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: VISION_PROMPT },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${thumbnail.toString("base64")}` } },
                    ],
                }],
            }),
        });
        if (!response.ok) {
            log.warn({ status: response.status }, "Vision provider answered with an error");
            return { layer: this.name, verdict: "error", reason: "layer_unavailable", scores: { httpStatus: response.status } };
        }
        const body = (await response.json()) as { choices?: { message?: { content?: string } }[]; usage?: unknown };
        const answer = parseVisionAnswer(body.choices?.[0]?.message?.content ?? "");
        if (!answer) {
            return { layer: this.name, verdict: "error", reason: "layer_unavailable", scores: { unparsable: true } };
        }
        const result = verdictFromAnswer(answer);
        return { layer: this.name, ...result, scores: { ...result.scores, model: this.config.model, usage: body.usage ?? null } };
    }
}
