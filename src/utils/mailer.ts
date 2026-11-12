import { Resend } from "resend";
import { AppError } from "../errors/appError";
import { logger } from "./logger";
import { passwordResetSubject, renderPasswordResetHtml, renderPasswordResetText } from "./emailTemplates/passwordReset";

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

export async function sendPasswordResetCode(to: string, code: string, validMinutes: number): Promise<void> {
    const { client, from } = getMailConfig();
    const subject = passwordResetSubject(code);
    const text = renderPasswordResetText(code, validMinutes);
    const html = renderPasswordResetHtml(code, validMinutes);

    const { error } = await client.emails.send({ from, to, subject, text, html });
    if (error) {
        // The address and the code stay out of the log.
        log.error({ errName: error.name, errMessage: error.message }, "Resend rejected the password reset email");
        throw new AppError("Could not send email", 502);
    }
    log.info("Password reset email sent");
}
