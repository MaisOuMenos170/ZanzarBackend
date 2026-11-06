export class AppError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number = 500,
        /** Stable machine-readable reason the app can branch on (e.g. `duplicate_photo`). */
        public readonly code?: string,
    ) {
        super(message);
        this.name = "AppError";
        Error.captureStackTrace(this, this.constructor);
    }
}


// Usage example (in a service):
// import { AppError } from "../errors/AppError";
// throw new AppError("User not found", 404);
