import { RequestHandler } from "express";
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
