import { RequestHandler } from "express";
import { userService } from "../services/user.service";

export const getUser: RequestHandler = async (req, res) => {
    const user = await userService.getById(Number(req.params.id));
    res.json(user);
};

export const createUser: RequestHandler = async (req, res) => {
    const user = await userService.create(req.body);
    const { passwordHash, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
};