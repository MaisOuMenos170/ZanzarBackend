import { describe, expect, it } from "vitest";
import { createUserSchema } from "../modules/users/schema/createUserSchema.js";
import { PASSWORD_MIN_LENGTH } from "./auth.js";

describe("auth password rules", () => {
    it("requires at least eight characters with a letter and a number", () => {
        expect(PASSWORD_MIN_LENGTH).toBe(8);

        const valid = createUserSchema.safeParse({
            username: "tiago",
            email: "tiago@example.com",
            password: "secret12",
        });
        expect(valid.success).toBe(true);

        const short = createUserSchema.safeParse({
            username: "tiago",
            email: "tiago@example.com",
            password: "abc1234",
        });
        expect(short.success).toBe(false);
    });
});
