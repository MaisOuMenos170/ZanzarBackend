import assert from "node:assert/strict";
import { createUserSchema } from "../modules/users/schema/createUserSchema.js";
import { loginAuthSchema } from "../modules/auth/schema/loginAuthSchema.js";
import { PASSWORD_MIN_LENGTH } from "./auth.js";

assert.equal(PASSWORD_MIN_LENGTH, 8);

const validSignup = {
    username: "tiago",
    email: "tiago@example.com",
    password: "secret12",
};

assert.equal(createUserSchema.safeParse(validSignup).success, true);

const shortPassword = createUserSchema.safeParse({ ...validSignup, password: "abc1234" });
assert.equal(shortPassword.success, false);

const missingNumber = createUserSchema.safeParse({ ...validSignup, password: "abcdefgh" });
assert.equal(missingNumber.success, false);

const loginResult = loginAuthSchema.safeParse({ email: "tiago@example.com", password: "secret12" });
assert.equal(loginResult.success, true);

console.log("auth.test.ts: ok");
