import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
    err: any, req: Request, res: Response, next: NextFunction
) {
    const statusCode = err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';

    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(isProduction ? {} : { stack: err.stack })
    });
};