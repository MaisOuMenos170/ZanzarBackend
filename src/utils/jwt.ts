import jwt, { type JwtPayload, type VerifyCallback } from "jsonwebtoken";

const JWT_VERIFY_OPTIONS: jwt.VerifyOptions = { algorithms: ["HS256"] };

export function verifyJwtToken(
    token: string,
    callback: VerifyCallback<JwtPayload | string>,
): void {
    jwt.verify(token, process.env.JWT_SECRET as string, JWT_VERIFY_OPTIONS, callback);
}

export function decodeJwtPayload(token: string): JwtPayload | undefined {
    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET as string,
            JWT_VERIFY_OPTIONS,
        );
        return typeof decoded === "string" ? undefined : decoded;
    } catch {
        return undefined;
    }
}
