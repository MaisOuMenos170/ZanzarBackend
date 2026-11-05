import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorHandler } from "../../middlewares/errorHandler.js";
import { devPhotoFilesRouter } from "./dev-photo-files.routes.js";
import { DiskPhotoStorage, getPhotoStorage, setPhotoStorageForTesting, SupabasePhotoStorage } from "./photo-storage.js";
import { vi } from "vitest";

describe("DiskPhotoStorage and its dev file route", () => {
    let root: string;
    let storage: DiskPhotoStorage;
    const app = express().use(devPhotoFilesRouter).use(errorHandler);

    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), "user-photos-"));
        storage = new DiskPhotoStorage(root, "http://127.0.0.1:3000", "secret");
        setPhotoStorageForTesting(storage);
    });

    afterEach(async () => {
        setPhotoStorageForTesting(undefined);
        await rm(root, { recursive: true, force: true });
    });

    it("serves a private file only through a valid, unexpired signed URL", async () => {
        await storage.putPrivate("abc.jpg", Buffer.from("jpeg-bytes"));
        const signed = new URL(await storage.signedPrivateUrl("abc.jpg", 60));

        const ok = await request(app).get(signed.pathname + signed.search);
        expect(ok.status).toBe(200);
        expect(ok.body.toString()).toBe("jpeg-bytes");

        expect((await request(app).get("/dev-photos/private/abc.jpg")).status).toBe(403);
        const tampered = signed.search.replace(/signature=[0-9a-f]/, "signature=z");
        expect((await request(app).get(signed.pathname + tampered)).status).toBe(403);
        expect(storage.isValidSignature("abc.jpg", Math.floor(Date.now() / 1000) - 1, storage.signature("abc.jpg", 0))).toBe(false);
    });

    it("refuses keys that try to leave the folder and never overwrites a file", async () => {
        await expect(storage.putPrivate("../escape.jpg", Buffer.from("x"))).rejects.toThrow("Unsafe storage key");
        await storage.putPublic("same.jpg", Buffer.from("first"));
        await expect(storage.putPublic("same.jpg", Buffer.from("second"))).rejects.toThrow();
        expect((await readFile(storage.filePath("public", "same.jpg"))).toString()).toBe("first");
    });

    it("removes files", async () => {
        await storage.putPrivate("gone.jpg", Buffer.from("x"));
        await storage.remove({ privateKeys: ["gone.jpg"] });
        await expect(readFile(storage.filePath("private", "gone.jpg"))).rejects.toThrow();
    });
});

describe("getPhotoStorage", () => {
    afterEach(() => setPhotoStorageForTesting(undefined));

    it("disables uploads in production when nothing is configured", () => {
        setPhotoStorageForTesting(undefined);
        expect(getPhotoStorage({ NODE_ENV: "production" })).toBeNull();
    });

    it("disables uploads when a Supabase variable is missing", () => {
        setPhotoStorageForTesting(undefined);
        expect(getPhotoStorage({ NODE_ENV: "production", PHOTO_STORAGE: "supabase", SUPABASE_URL: "https://x.supabase.co" })).toBeNull();
    });
});

describe("SupabasePhotoStorage", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("uploads with a short CDN cache, so a deleted photo stops being served within minutes", async () => {
        const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const storage = new SupabasePhotoStorage("https://x.supabase.co", "service-key", "priv", "pub");

        await storage.putPublic("abc.jpg", Buffer.from("jpeg"));

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        const headers = init.headers as Record<string, string>;
        expect(url).toBe("https://x.supabase.co/storage/v1/object/pub/abc.jpg");
        expect(headers["Cache-Control"]).toBe("max-age=600");
        expect(headers["x-upsert"]).toBe("false");
        expect(headers.Authorization).toBe("Bearer service-key");
    });

    it("turns a storage error into a 503 without leaking the key", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
        const storage = new SupabasePhotoStorage("https://x.supabase.co", "service-key", "priv", "pub");
        const error = await storage.putPrivate("abc.jpg", Buffer.from("jpeg")).then(() => null, (e: Error & { statusCode?: number }) => e);
        expect(error?.statusCode).toBe(503);
        expect(error?.message).not.toContain("service-key");
    });
});
