import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_PHOTO_CACHE_SECONDS } from "../../constants/user-photos";
import { AppError } from "../../errors/appError";
import { logger } from "../../utils/logger";

const log = logger.child({ module: "userPhotos", layer: "storage" });

/**
 * Where user photo files live. Private objects (pending, rejected, the review queue) are only reachable through
 * short-lived signed URLs; public objects are the approved copies the app shows to everyone.
 * Keys are random file names chosen by the service; neither side ever lists a bucket.
 */
export interface PhotoStorage {
    putPrivate(key: string, data: Buffer): Promise<void>;
    getPrivate(key: string): Promise<Buffer>;
    signedPrivateUrl(key: string, ttlSeconds: number): Promise<string>;
    putPublic(key: string, data: Buffer): Promise<void>;
    publicUrl(key: string): string;
    remove(keys: { privateKeys?: string[]; publicKeys?: string[] }): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9-]+\.jpg$/;

function assertSafeKey(key: string) {
    if (!SAFE_KEY.test(key)) {
        throw new Error(`Unsafe storage key: ${key}`);
    }
}

/**
 * Supabase Storage through its REST API with the service-role key (server only, never sent to the app).
 * The private bucket must be private; the public bucket public. Both are created by hand in the dashboard.
 */
export class SupabasePhotoStorage implements PhotoStorage {
    constructor(
        private readonly baseUrl: string,
        private readonly serviceKey: string,
        private readonly privateBucket: string,
        private readonly publicBucket: string,
    ) {}

    private headers(extra: Record<string, string> = {}) {
        return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
    }

    private async request(method: string, urlPath: string, body?: string | Blob, headers: Record<string, string> = {}) {
        const response = await fetch(`${this.baseUrl}/storage/v1/${urlPath}`, { method, body, headers: this.headers(headers) });
        if (!response.ok) {
            log.error({ method, status: response.status }, "Storage request failed");
            throw new AppError("Photo storage unavailable", 503, "storage_unavailable");
        }
        return response;
    }

    private async put(bucket: string, key: string, data: Buffer) {
        assertSafeKey(key);
        await this.request("POST", `object/${bucket}/${key}`, new Blob([new Uint8Array(data)]), {
            "Content-Type": "image/jpeg",
            "x-upsert": "false",
            "Cache-Control": `max-age=${PUBLIC_PHOTO_CACHE_SECONDS}`,
        });
    }

    putPrivate(key: string, data: Buffer) {
        return this.put(this.privateBucket, key, data);
    }

    putPublic(key: string, data: Buffer) {
        return this.put(this.publicBucket, key, data);
    }

    async getPrivate(key: string) {
        assertSafeKey(key);
        const response = await this.request("GET", `object/${this.privateBucket}/${key}`);
        return Buffer.from(await response.arrayBuffer());
    }

    async signedPrivateUrl(key: string, ttlSeconds: number) {
        assertSafeKey(key);
        const response = await this.request(
            "POST",
            `object/sign/${this.privateBucket}/${key}`,
            JSON.stringify({ expiresIn: ttlSeconds }),
            { "Content-Type": "application/json" },
        );
        const { signedURL } = (await response.json()) as { signedURL: string };
        return `${this.baseUrl}/storage/v1${signedURL}`;
    }

    publicUrl(key: string) {
        assertSafeKey(key);
        return `${this.baseUrl}/storage/v1/object/public/${this.publicBucket}/${key}`;
    }

    async remove({ privateKeys = [], publicKeys = [] }: { privateKeys?: string[]; publicKeys?: string[] }) {
        for (const [bucket, keys] of [[this.privateBucket, privateKeys], [this.publicBucket, publicKeys]] as const) {
            if (keys.length === 0) continue;
            keys.forEach(assertSafeKey);
            await this.request("DELETE", `object/${bucket}`, JSON.stringify({ prefixes: keys }), {
                "Content-Type": "application/json",
            });
        }
    }
}

/**
 * Local folder for development and tests. Files are served by `devPhotoFilesRouter`; private ones need an
 * HMAC-signed, expiring URL, mirroring how the real storage behaves.
 */
export class DiskPhotoStorage implements PhotoStorage {
    constructor(
        private readonly root: string,
        private readonly publicBaseUrl: string,
        private readonly signingSecret: string,
    ) {}

    private file(visibility: "private" | "public", key: string) {
        assertSafeKey(key);
        return path.join(this.root, visibility, key);
    }

    private async put(visibility: "private" | "public", key: string, data: Buffer) {
        const file = this.file(visibility, key);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, data, { flag: "wx" });
    }

    putPrivate(key: string, data: Buffer) {
        return this.put("private", key, data);
    }

    putPublic(key: string, data: Buffer) {
        return this.put("public", key, data);
    }

    getPrivate(key: string) {
        return readFile(this.file("private", key));
    }

    signature(key: string, expires: number) {
        return createHmac("sha256", this.signingSecret).update(`${key}:${expires}`).digest("hex");
    }

    isValidSignature(key: string, expires: number, signature: string, now = Date.now()) {
        if (!Number.isFinite(expires) || expires * 1000 < now) return false;
        const expected = Buffer.from(this.signature(key, expires));
        const given = Buffer.from(signature);
        return expected.length === given.length && timingSafeEqual(expected, given);
    }

    async signedPrivateUrl(key: string, ttlSeconds: number) {
        const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
        return `${this.publicBaseUrl}/dev-photos/private/${key}?expires=${expires}&signature=${this.signature(key, expires)}`;
    }

    publicUrl(key: string) {
        assertSafeKey(key);
        return `${this.publicBaseUrl}/dev-photos/public/${key}`;
    }

    filePath(visibility: "private" | "public", key: string) {
        return this.file(visibility, key);
    }

    async remove({ privateKeys = [], publicKeys = [] }: { privateKeys?: string[]; publicKeys?: string[] }) {
        await Promise.all([
            ...privateKeys.map((key) => rm(this.file("private", key), { force: true })),
            ...publicKeys.map((key) => rm(this.file("public", key), { force: true })),
        ]);
    }
}

let configured: PhotoStorage | null | undefined;

/**
 * Picks the storage from the environment. `PHOTO_STORAGE=supabase` needs `SUPABASE_URL`,
 * `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PRIVATE_BUCKET` and `SUPABASE_PUBLIC_BUCKET`.
 * `PHOTO_STORAGE=disk` (the default outside production) writes under `PHOTO_STORAGE_DIR`.
 * In production with nothing configured it returns null and uploads answer 503.
 */
export function getPhotoStorage(env: NodeJS.ProcessEnv = process.env): PhotoStorage | null {
    if (configured !== undefined) return configured;
    const kind = env.PHOTO_STORAGE?.trim() || (env.NODE_ENV === "production" ? "" : "disk");

    if (kind === "supabase") {
        const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PRIVATE_BUCKET, SUPABASE_PUBLIC_BUCKET } = env;
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_PRIVATE_BUCKET || !SUPABASE_PUBLIC_BUCKET) {
            log.error("PHOTO_STORAGE=supabase but a SUPABASE_* variable is missing; photo uploads are disabled");
            configured = null;
        } else {
            configured = new SupabasePhotoStorage(
                SUPABASE_URL.replace(/\/$/, ""),
                SUPABASE_SERVICE_ROLE_KEY,
                SUPABASE_PRIVATE_BUCKET,
                SUPABASE_PUBLIC_BUCKET,
            );
        }
    } else if (kind === "disk" && env.NODE_ENV !== "production") {
        const port = env.PORT ?? "8000";
        configured = new DiskPhotoStorage(
            env.PHOTO_STORAGE_DIR ?? path.resolve(".data/user-photos"),
            (env.PHOTO_PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, ""),
            env.JWT_SECRET ?? "dev-only-secret",
        );
    } else {
        configured = null;
    }
    return configured;
}

/** Tests swap the storage with this; `undefined` goes back to reading the environment. */
export function setPhotoStorageForTesting(storage: PhotoStorage | null | undefined) {
    configured = storage;
}
