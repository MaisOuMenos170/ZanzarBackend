import { describe, expect, it, vi } from "vitest";
import { requireOwnershipFromParams } from "./requireOwnership.js";
import { AppError } from "../errors/appError.js";

describe("requireOwnershipFromParams", () => {
    it("calls next when the authenticated user owns the resource", () => {
        const middleware = requireOwnershipFromParams("id");
        const next = vi.fn();
        const req = {
            user: { id: "user-1" },
            params: { id: "user-1" },
        } as any;

        middleware(req, {} as any, next);

        expect(next).toHaveBeenCalledOnce();
        expect(next.mock.calls[0][0]).toBeUndefined();
    });

    it("forwards a 403 AppError when ids differ", () => {
        const middleware = requireOwnershipFromParams("id");
        const next = vi.fn();
        const req = {
            user: { id: "user-1" },
            params: { id: "user-2" },
        } as any;

        middleware(req, {} as any, next);

        expect(next).toHaveBeenCalledOnce();
        const error = next.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(403);
    });
});
