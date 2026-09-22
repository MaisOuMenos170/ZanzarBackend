export class AppError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number = 500,
    ) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
    }
}


// Usage example (in a service):
// import { AppError } from "../errors/AppError";
// throw new AppError("User not found", 404);