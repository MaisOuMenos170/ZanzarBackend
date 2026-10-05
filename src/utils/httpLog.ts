import type { Request } from "express";
import type { z } from "zod";

/** Request path without the query string, which can carry user-provided data (and coordinates). */
export function getRequestPath(req: Request): string {
    return req.originalUrl.split("?")[0];
}

/** Field paths and issue codes only: never log the submitted values. */
export function summarizeIssues(error: z.ZodError): { path: string; code: string }[] {
    // String() (not join) because zod paths are PropertyKey[] and may contain symbols.
    return error.issues.map((issue) => ({ path: issue.path.map(String).join("."), code: issue.code }));
}
