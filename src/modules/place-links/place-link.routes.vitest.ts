import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { placeRepository } from "../places/place.repository.js";
import { buildAppAssociation, escapeHtml, placeLinkRouter, renderPlacePage } from "./place-link.routes.js";

function createApp() {
    const app = express();
    app.use(placeLinkRouter);
    return app;
}

describe("place links", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete process.env.APP_DOWNLOAD_URL;
    });

    it("serves the apple-app-site-association file as JSON for /p/* links", async () => {
        const response = await request(createApp()).get("/.well-known/apple-app-site-association");

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toContain("application/json");
        expect(response.body).toEqual(buildAppAssociation());
        expect(response.body.applinks.details[0].appIDs[0]).toMatch(/^[A-Z0-9]{10}\.dalpra\.Zanzar$/);
        expect(response.body.applinks.details[0].components).toEqual([{ "/": "/p/*" }]);
    });

    it("takes the team and bundle id from the environment when set", () => {
        const association = buildAppAssociation({ APPLE_TEAM_ID: "ABCDE12345", APPLE_BUNDLE_ID: "com.example.app,other" });

        expect(association.applinks.details[0]?.appIDs).toEqual(["ABCDE12345.com.example.app"]);
    });

    it("shows the place name and a link that opens the app", async () => {
        vi.spyOn(placeRepository, "findByPlaceId").mockResolvedValue({ name: "Jardim Botânico" } as never);

        const response = await request(createApp()).get("/p/ChIJabc-123");

        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toContain("text/html");
        expect(response.text).toContain("Jardim Botânico");
        expect(response.text).toContain('href="lero://place/ChIJabc-123"');
        expect(response.text).not.toContain("Baixar o app");
    });

    it("offers the download link when one is configured", async () => {
        process.env.APP_DOWNLOAD_URL = "https://testflight.apple.com/join/abc";
        vi.spyOn(placeRepository, "findByPlaceId").mockResolvedValue({ name: "Museu" } as never);

        const response = await request(createApp()).get("/p/ChIJabc");

        expect(response.text).toContain('href="https://testflight.apple.com/join/abc"');
    });

    it("answers 404 for an unknown place", async () => {
        vi.spyOn(placeRepository, "findByPlaceId").mockResolvedValue(null);

        const response = await request(createApp()).get("/p/unknown");

        expect(response.status).toBe(404);
    });

    it("escapes what it prints, so a place name cannot inject markup", () => {
        const html = renderPlacePage(`<script>alert("x")</script>`, `a"b`, null);

        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
        expect(html).toContain("lero://place/a%22b");
        expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    });
});
