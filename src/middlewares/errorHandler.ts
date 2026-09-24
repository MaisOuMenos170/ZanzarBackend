import type { Request, Response, NextFunction } from 'express';

// Maps known database errors to client-facing status codes and messages.
function normalizeError(err: any): { statusCode: number; message: string; details?: unknown } {
    // MongoDB "Document failed validation" (schema validator on the collection)
    if (err?.code === 121) {
        return {
            statusCode: 400,
            message: 'Document failed validation',
            details: err.errInfo?.details,
        };
    }
    // Duplicate key (unique index)
    if (err?.code === 11000) {
        return {
            statusCode: 409,
            message: `Duplicate value for: ${Object.keys(err.keyPattern ?? {}).join(', ') || 'unique field'}`,
        };
    }
    // Mongoose schema validation / bad casts (e.g. malformed ObjectId)
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
        return { statusCode: 400, message: err.message };
    }
    return {
        statusCode: err.statusCode || 500,
        message: err.message || 'Internal Server Error',
    };
}

export function errorHandler(
    err: any, req: Request, res: Response, next: NextFunction
) {
    const { statusCode, message, details } = normalizeError(err);
    const isProduction = process.env.NODE_ENV === 'production';

    res.status(statusCode).json({
        success: false,
        message: statusCode >= 500 && isProduction ? 'Internal Server Error' : message,
        ...(isProduction ? {} : { details, stack: err.stack })
    });
};
