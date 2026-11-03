import path from "node:path";
import sharp from "sharp";
import type { InferenceSession } from "onnxruntime-node";
import type { LayerResult, ModerationInput, ModerationLayer } from "./moderation-layer";

/**
 * Measured on the moderation sample (docs/fotos-de-usuario-decisao.md): a face covering 1% of the photo, or a crowd
 * of 5+ faces, caught 4 of 5 photos with prominent people; the app repeats this check on the device.
 */
export const FACE_MIN_SCORE = 0.7;
export const FACE_PROMINENT_AREA = 0.01;
export const FACE_CROWD_COUNT = 5;

const MODEL_PATH = path.resolve(__dirname, "../../../../models/ultraface/version-RFB-320.onnx");
const WIDTH = 320;
const HEIGHT = 240;

type Box = [number, number, number, number];

function iou(a: Box, b: Box) {
    const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const inter = w * h;
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter);
}

/** Server-side face check with UltraFace RFB-320 (1.2 MB ONNX, ~5 ms per photo, ~11 MB of memory). */
export class FaceLayer implements ModerationLayer {
    readonly name = "faces";
    private session: Promise<InferenceSession> | null = null;

    private load() {
        this.session ??= import("onnxruntime-node").then((ort) =>
            ort.InferenceSession.create(MODEL_PATH, { logSeverityLevel: 3 }));
        return this.session;
    }

    async detect(jpeg: Buffer): Promise<{ count: number; largestArea: number }> {
        const ort = await import("onnxruntime-node");
        const session = await this.load();
        const pixels = await sharp(jpeg).resize(WIDTH, HEIGHT, { fit: "fill" }).removeAlpha().raw().toBuffer();
        const plane = WIDTH * HEIGHT;
        const input = new Float32Array(3 * plane);
        for (let i = 0; i < plane; i++) {
            for (let c = 0; c < 3; c++) input[c * plane + i] = (pixels[i * 3 + c] - 127) / 128;
        }
        const output = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, HEIGHT, WIDTH]) });
        const scores = output.scores.data as Float32Array;
        const boxes = output.boxes.data as Float32Array;

        const found: { score: number; box: Box }[] = [];
        for (let i = 0; i < scores.length / 2; i++) {
            const score = scores[i * 2 + 1];
            if (score > FACE_MIN_SCORE) found.push({ score, box: Array.from(boxes.subarray(i * 4, i * 4 + 4)) as Box });
        }
        found.sort((a, b) => b.score - a.score);
        const kept: Box[] = [];
        for (const face of found) {
            if (kept.every((box) => iou(box, face.box) < 0.3)) kept.push(face.box);
        }
        const areas = kept.map((b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]));
        return { count: kept.length, largestArea: Math.max(0, ...areas) };
    }

    async run({ jpeg }: ModerationInput): Promise<LayerResult> {
        const { count, largestArea } = await this.detect(jpeg);
        const prominent = largestArea >= FACE_PROMINENT_AREA || count >= FACE_CROWD_COUNT;
        return {
            layer: this.name,
            verdict: prominent ? "doubt" : "pass",
            reason: prominent ? "face_prominent" : undefined,
            scores: { count, largestArea: Number(largestArea.toFixed(4)) },
        };
    }
}
