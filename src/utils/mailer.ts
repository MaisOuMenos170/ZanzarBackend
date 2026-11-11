import { Resend } from "resend";
import { AppError } from "../errors/appError";
import { logger } from "./logger";
import { escapeHtml } from "./html";

const log = logger.child({ module: "mailer", layer: "util" });

let client: Resend | undefined;

function getMailConfig(): { client: Resend; from: string } {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !from) {
        log.error("RESEND_API_KEY or EMAIL_FROM is not set, cannot send emails");
        throw new AppError("Email is not configured", 503);
    }
    client ??= new Resend(apiKey);
    return { client, from };
}

/** Throws 503 early when email is not configured, before any state is written. */
export function assertMailerConfigured(): void {
    getMailConfig();
}

/** `link` opens the app (via the bridge page and lero://); the code stays as a fallback, e.g. on a computer. */
export async function sendPasswordResetCode(
    to: string,
    code: string,
    validMinutes: number,
    link: string | null = null,
): Promise<void> {
    const { client, from } = getMailConfig();
    const subject = `Seu código para redefinir a senha: ${code}`;
    const text = [
        "Olá!",
        "",
        ...(link
            ? [
                  "Toque no link abaixo no iPhone com o Lero instalado para redefinir sua senha:",
                  "",
                  link,
                  "",
                  `Ou use este código no app. O link e o código valem por ${validMinutes} minutos e só podem ser usados uma vez.`,
              ]
            : [
                  `Use o código abaixo para redefinir sua senha no Lero. Ele vale por ${validMinutes} minutos e só pode ser usado uma vez.`,
              ]),
        "",
        code,
        "",
        "Se você não pediu para redefinir a senha, ignore este e-mail. Sua senha continua a mesma.",
    ].join("\n");
    const linkHtml = link
        ? `
  <p>Toque no botão abaixo no iPhone com o Lero instalado para redefinir sua senha.</p>
  <p style="margin: 24px 0;"><a href="${escapeHtml(link)}" style="display: inline-block; background: #1a1a1a; color: #ffffff; text-decoration: none; font-weight: 600; padding: 14px 24px; border-radius: 12px;">Redefinir senha no app</a></p>
  <p>Ou use este código no app. O link e o código valem por ${validMinutes} minutos e só podem ser usados uma vez.</p>`
        : `
  <p>Use o código abaixo para redefinir sua senha no Lero. Ele vale por ${validMinutes} minutos e só pode ser usado uma vez.</p>`;
    const html = `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 480px;">
  <p>Olá!</p>${linkHtml}
  <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0;">${code}</p>
  <p style="color: #666;">Se você não pediu para redefinir a senha, ignore este e-mail. Sua senha continua a mesma.</p>
</div>`;

    const { error } = await client.emails.send({ from, to, subject, text, html });
    if (error) {
        // The address and the code stay out of the log.
        log.error({ errName: error.name, errMessage: error.message }, "Resend rejected the password reset email");
        throw new AppError("Could not send email", 502);
    }
    log.info("Password reset email sent");
}
