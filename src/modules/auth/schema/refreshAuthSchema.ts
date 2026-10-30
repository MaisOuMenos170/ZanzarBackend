import { z } from "zod";

export const refreshAuthSchema = z.object({
    refreshToken: z.string().min(1),
});

export type RefreshAuthInput = z.infer<typeof refreshAuthSchema>;
