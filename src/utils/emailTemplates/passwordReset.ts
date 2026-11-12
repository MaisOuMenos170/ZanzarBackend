/**
 * Password reset email, styled after the app's login/signup screens
 * (Figma "Macro Challenge"): light blue background, white pill surfaces,
 * purple primary and rounded semibold headings.
 *
 * Email clients ignore external CSS and most modern layout, so this uses
 * nested tables with inline styles only. SF Pro is not available outside
 * Apple devices, so each font stack falls back to system fonts.
 */

const colors = {
    background: "#eff5ff", // Blue/50
    surface: "#ffffff", // Neutral/50
    primary: "#6365ef", // Purple/500
    text: "#000000", // Grays/Black
    textMuted: "#292929", // Neutral/950
    placeholder: "#bdbdbd", // Neutral/300
} as const;

// Single quotes only: these go inside style="..." attributes.
const fontRounded = `ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const fontText = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Helvetica, Arial, sans-serif`;

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function passwordResetSubject(code: string): string {
    return `Seu código para redefinir a senha: ${code}`;
}

export function renderPasswordResetText(code: string, validMinutes: number): string {
    return [
        "Olá!",
        "",
        `Use o código abaixo para redefinir sua senha no Lero. Ele vale por ${validMinutes} minutos e só pode ser usado uma vez.`,
        "",
        code,
        "",
        "Se você não pediu para redefinir a senha, ignore este e-mail. Sua senha continua a mesma.",
    ].join("\n");
}

export function renderPasswordResetHtml(code: string, validMinutes: number): string {
    const safeCode = escapeHtml(code);
    const preheader = `Seu código é ${safeCode}. Ele vale por ${validMinutes} minutos.`;

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Redefinir senha</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${colors.background};">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${colors.background};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 480px;">
          <tr>
            <td style="padding: 0 0 24px 0; font-family: ${fontRounded}; font-size: 20px; font-weight: 600; letter-spacing: 0.25px; color: ${colors.primary};">
              Lero
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 16px 0; font-family: ${fontRounded}; font-size: 32px; line-height: 38px; font-weight: 600; letter-spacing: 0.25px; color: ${colors.text};">
              Redefinir senha
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 24px 0; font-family: ${fontText}; font-size: 16px; line-height: 24px; letter-spacing: 0.15px; color: ${colors.text};">
              Use o código abaixo para redefinir sua senha no Lero. Ele vale por <strong style="font-weight: 600;">${validMinutes} minutos</strong> e só pode ser usado uma vez.
            </td>
          </tr>
          <tr>
            <td style="padding: 0 0 8px 0; font-family: ${fontText}; font-size: 14px; letter-spacing: 0.25px; color: ${colors.text};">
              Código
            </td>
          </tr>
          <tr>
            <td align="center" bgcolor="${colors.surface}" style="background-color: ${colors.surface}; border-radius: 39px; padding: 20px 16px; font-family: ${fontRounded}; font-size: 36px; line-height: 40px; font-weight: 600; letter-spacing: 10px; color: ${colors.primary};">
              ${safeCode}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 0 0 0; font-family: ${fontText}; font-size: 14px; line-height: 20px; letter-spacing: 0.25px; color: ${colors.textMuted};">
              Se você não pediu para redefinir a senha, ignore este e-mail. Sua senha continua a mesma.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
