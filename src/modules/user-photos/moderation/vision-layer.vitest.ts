import { Types } from "mongoose";
import { describe, expect, it, vi } from "vitest";
import type { UserPhoto } from "../../../models";
import { runLayerSafely } from "./moderation-layer";
import { parseVisionAnswer, VisionLayer, visionConfigFromEnv } from "./vision-layer";

const clean = {
    shows_venue: true, person_face_prominent: false, minors_visible: false, nudity_or_sexual: false, violence_or_gore: false,
    personal_data_visible: false, offensive_text: false, watermark_or_credit: false, low_quality: false, reason: "a bar facade",
};
const input = { photo: { _id: new Types.ObjectId() } as unknown as UserPhoto, jpeg: Buffer.from("full"), thumbnail: Buffer.from("thumb") };
const config = { url: "https://vision.test/v1/chat/completions", apiKey: "k", model: "m", timeoutMs: 1000 };

function answering(content: string, status = 200) {
    return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as unknown as typeof fetch;
}

describe("VisionLayer", () => {
    it("sends the thumbnail as a data URL with the API key and passes a clean venue photo", async () => {
        const fetchMock = answering(JSON.stringify(clean));
        const result = await new VisionLayer(config, fetchMock).run(input);

        expect(result).toMatchObject({ layer: "vision", verdict: "pass" });
        const [url, init] = vi.mocked(fetchMock).mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(config.url);
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
        const body = JSON.parse(init.body as string);
        expect(body.messages[0].content[1].image_url.url).toBe(`data:image/jpeg;base64,${Buffer.from("thumb").toString("base64")}`);
    });

    it.each([
        ["nudity_or_sexual", "nudity"],
        ["minors_visible", "minors"],
        ["personal_data_visible", "personal_data"],
        ["watermark_or_credit", "watermark"],
        ["offensive_text", "offensive_text"],
    ])("sends a photo with %s to review as %s", async (flag, reason) => {
        const result = await new VisionLayer(config, answering(JSON.stringify({ ...clean, [flag]: true }))).run(input);
        expect(result).toMatchObject({ verdict: "doubt", reason });
    });

    it("holds a photo that does not show the place, and ignores the model's own quality opinion", async () => {
        expect((await new VisionLayer(config, answering(JSON.stringify({ ...clean, shows_venue: false }))).run(input)).reason).toBe("not_the_place");
        expect((await new VisionLayer(config, answering(JSON.stringify({ ...clean, low_quality: true }))).run(input)).verdict).toBe("pass");
    });

    it("reads JSON wrapped in prose or a code fence", () => {
        expect(parseVisionAnswer("Here you go:\n```json\n{\"shows_venue\": true}\n```")).toEqual({ shows_venue: true });
        expect(parseVisionAnswer("no json here")).toBeNull();
    });

    it("reports an error (never a pass) when the provider fails, answers garbage or times out", async () => {
        expect((await new VisionLayer(config, answering("", 503)).run(input)).verdict).toBe("error");
        expect((await new VisionLayer(config, answering("I cannot help with that")).run(input)).verdict).toBe("error");
        expect((await new VisionLayer(config, answering(JSON.stringify({ reason: "?" }))).run(input)).verdict).toBe("error");
        const hanging = vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }) as unknown as typeof fetch;
        expect((await runLayerSafely(new VisionLayer(config, hanging), input)).verdict).toBe("error");
    });

    it("is off unless both the URL and the model are configured", () => {
        expect(visionConfigFromEnv({})).toBeNull();
        expect(visionConfigFromEnv({ VISION_API_URL: "http://127.0.0.1:11434/v1/chat/completions" })).toBeNull();
        expect(visionConfigFromEnv({ VISION_API_URL: "http://x", VISION_MODEL: "m" })).toMatchObject({ url: "http://x", model: "m", apiKey: undefined });
    });
});
