import express from "express";
import type { Router } from "express";
import { placeRepository } from "../places/place.repository";
import { logger } from "../../utils/logger";

/**
 * Public pages behind the link the iOS app shares for a place (`https://<api host>/p/<placeId>`).
 *
 * With the app installed, iOS opens the app straight from the link (Universal Links, which read the
 * `apple-app-site-association` file below) and never loads this page. Without it, or when the link is opened
 * from the address bar, this page is what the person sees, with a button to try the app again.
 */
export const placeLinkRouter: Router = express.Router();

const log = logger.child({ module: "place-links" });

/** Team ID of the Apple developer account that signs the app. It is public: it is in every signed build. */
const DEFAULT_APPLE_TEAM_ID = "982D3NRR89";
const DEFAULT_APPLE_BUNDLE_ID = "dalpra.Zanzar";
/** URL scheme the app registers (CFBundleURLTypes); `lero://place/<id>` opens the place directly. */
export const APP_URL_SCHEME = "lero";
export const PLACE_LINK_PATH = "/p";

export function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function buildAppAssociation(env: NodeJS.ProcessEnv = process.env) {
    const teamId = env.APPLE_TEAM_ID?.trim() || DEFAULT_APPLE_TEAM_ID;
    const bundleId = env.APPLE_BUNDLE_ID?.split(",")[0]?.trim() || DEFAULT_APPLE_BUNDLE_ID;
    return {
        applinks: {
            details: [{ appIDs: [`${teamId}.${bundleId}`], components: [{ "/": `${PLACE_LINK_PATH}/*` }] }],
        },
    };
}

/** Page shown when the link opens in a browser. `downloadUrl` (TestFlight or App Store) is optional. */
export function renderPlacePage(placeName: string, placeId: string, downloadUrl: string | null): string {
    const name = escapeHtml(placeName);
    const appUrl = escapeHtml(`${APP_URL_SCHEME}://place/${encodeURIComponent(placeId)}`);
    const download = downloadUrl
        ? `<p><a class="secondary" href="${escapeHtml(downloadUrl)}">Baixar o app</a></p>`
        : "";
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} · O Lero</title>
<style>
body{font-family:-apple-system,system-ui,sans-serif;background:#f2f7ff;color:#1f1d73;margin:0;padding:48px 24px;text-align:center}
h1{font-size:24px;margin:0 0 8px}
p{margin:8px 0 24px;color:#292929}
a{display:inline-block;background:#6365ef;color:#fff;text-decoration:none;font-weight:600;padding:16px 32px;border-radius:30px}
a.secondary{background:none;color:#6365ef}
</style>
</head>
<body>
<h1>${name}</h1>
<p>Alguém compartilhou este lugar de Curitiba com você no O Lero.</p>
<p><a href="${appUrl}">Abrir no app</a></p>
${download}
</body>
</html>
`;
}

placeLinkRouter.get("/.well-known/apple-app-site-association", (_req, res) => {
    // Apple fetches this file without redirects and expects JSON, with no file extension.
    res.type("application/json").status(200).send(JSON.stringify(buildAppAssociation()));
});

placeLinkRouter.get(`${PLACE_LINK_PATH}/:placeId`, async (req, res, next) => {
    const placeId = req.params.placeId as string;
    try {
        const place = await placeRepository.findByPlaceId(placeId);
        if (!place) {
            log.debug({ placeId }, "Place link for an unknown place");
            res.status(404).type("text/plain").send("Lugar não encontrado.");
            return;
        }
        const downloadUrl = process.env.APP_DOWNLOAD_URL?.trim() || null;
        res.status(200).type("text/html; charset=utf-8").send(renderPlacePage(place.name, placeId, downloadUrl));
    } catch (err) {
        next(err);
    }
});
