import { z } from "zod";

export const appleLoginSchema = z.object({
    identityToken: z.string().min(1).max(4096),
    nonce: z.string().min(1).max(256).optional(),
    fullName: z
        .object({
            givenName: z.string().trim().max(100).nullish(),
            familyName: z.string().trim().max(100).nullish(),
        })
        .optional(),
});

export type AppleLoginInput = z.infer<typeof appleLoginSchema>;
