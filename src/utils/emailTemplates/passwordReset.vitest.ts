import { describe, expect, it } from "vitest";
import { passwordResetSubject, renderPasswordResetHtml, renderPasswordResetText } from "./passwordReset";

describe("password reset email template", () => {
    it("puts the code in subject, text and html", () => {
        expect(passwordResetSubject("123456")).toContain("123456");
        expect(renderPasswordResetText("123456", 15)).toContain("123456");
        expect(renderPasswordResetHtml("123456", 15)).toContain("123456");
    });

    it("mentions the validity in minutes", () => {
        expect(renderPasswordResetHtml("123456", 15)).toContain("15 minutos");
        expect(renderPasswordResetText("123456", 15)).toContain("15 minutos");
    });

    it("uses the brand colors from the app design", () => {
        const html = renderPasswordResetHtml("123456", 15);
        expect(html).toContain("#eff5ff");
        expect(html).toContain("#6365ef");
    });

    it("never puts double quotes inside a style attribute", () => {
        const html = renderPasswordResetHtml("123456", 15);
        const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
        expect(styles.length).toBeGreaterThan(5);
        // A stray quote would end the attribute early and drop font/size/color.
        const withoutStyles = html.replace(/style="[^"]*"/g, "");
        expect(withoutStyles).not.toMatch(/style="/);
        expect(withoutStyles).not.toMatch(/\bSF Pro/);
        expect(html).toContain("font-size: 32px");
    });

    it("escapes html in the code", () => {
        const html = renderPasswordResetHtml("<b>1</b>", 15);
        expect(html).not.toContain("<b>1</b>");
        expect(html).toContain("&lt;b&gt;1&lt;/b&gt;");
    });
});
