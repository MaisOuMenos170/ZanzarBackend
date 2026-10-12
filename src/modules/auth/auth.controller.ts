import { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { authService } from "./auth.service";

export const createUser: RequestHandler = async (req, res) => {
    const user = await authService.register(req.body);
    const { passwordHash, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
};

export const loginUser: RequestHandler = async (req, res) => {
    const token = await authService.login(req.body);
    res.status(200).json({ token });
}

export const logoutUser: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    await authService.logout(userId);
    res.status(204).send();
};
