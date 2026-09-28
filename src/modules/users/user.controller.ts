import { RequestHandler } from "express";
import { userService } from "./user.service";

export const getUser: RequestHandler = async (req, res) => {
    const user = await userService.getById(Number(req.params.id));
    res.json(user);
};
