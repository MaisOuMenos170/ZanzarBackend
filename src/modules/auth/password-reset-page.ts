import type { RequestHandler } from "express";
import { buildAppResetUrl, isLinkToken } from "./password-reset-link";
import { logger } from "../../utils/logger";
import { escapeHtml } from "../../utils/html";

const log = logger.child({ module: "auth", layer: "controller", flow: "passwordReset" });

function page(body: string, head = ""): string {
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Redefinir senha · Lero</title>${head}
<style>
  body { margin: 0; font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; background: #ffffff; }
  main { max-width: 420px; margin: 0 auto; padding: 48px 24px; }
  h1 { font-size: 24px; margin: 0 0 16px; }
  p { line-height: 1.5; color: #444; }
  a.button { display: block; text-align: center; background: #1a1a1a; color: #ffffff; text-decoration: none;
             font-weight: 600; padding: 16px 24px; border-radius: 12px; margin: 32px 0; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/**
 * GET /reset-password?token=…: target of the https link in the password reset email. Email clients don't let
 * people tap lero:// links, so the email points here and this page hands the token to the app.
 * It never consumes the token: mail scanners open links before the user does. The app consumes it via POST /password/verify.
 */
export const resetPasswordLinkPage: RequestHandler = (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex");

    const token = req.query.token;
    if (!isLinkToken(token)) {
        log.warn({ reason: "malformed_link_token" }, "Password reset link page opened with an invalid link");
        res.status(400).type("html").send(
            page(`<h1>Link inválido</h1>
<p>Este link de redefinição de senha está incompleto. Abra o link direto do e-mail ou peça um novo código no app.</p>`),
        );
        return;
    }

    const appUrl = escapeHtml(buildAppResetUrl(token));
    res.status(200).type("html").send(
        page(
            `<h1>Redefinir senha</h1>
<p>Se o Lero não abriu sozinho, toque no botão abaixo.</p>
<a class="button" href="${appUrl}">Abrir no Lero</a>
<p>Está no computador ou sem o app? Use o código de 6 dígitos que veio no mesmo e-mail, na tela "Esqueci a senha" do Lero.</p>`,
            `\n<meta http-equiv="refresh" content="0;url=${appUrl}">`,
        ),
    );
};
