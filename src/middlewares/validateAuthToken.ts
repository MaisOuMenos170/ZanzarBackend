import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/appError";

export const validateAuthToken: RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        throw new AppError("Access denied", 401);
    }

    jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
        if (err) {
            throw new AppError("Invalid JWT token", 403);
        }
        req.user = user;
        next();
    })
};
