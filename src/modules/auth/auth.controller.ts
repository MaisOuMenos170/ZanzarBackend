import { RequestHandler } from "express";
import { AppError } from "../../errors/appError";
import { authService } from "./auth.service";
import { passwordResetService } from "./password-reset.service";

export const forgotPassword: RequestHandler = async (req, res) => {
    await passwordResetService.requestCode(req.body.email);
    res.status(202).json({ message: "If the email belongs to an account, a code was sent to it" });
};

export const verifyResetCode: RequestHandler = async (req, res) => {
    const resetToken = await passwordResetService.verifyCode(req.body.email, req.body.code);
    res.status(200).json({ resetToken });
};

export const resetPassword: RequestHandler = async (req, res) => {
    await passwordResetService.resetPassword(req.body.resetToken, req.body.newPassword);
    res.status(204).send();
};

export const createUser: RequestHandler = async (req, res) => {
    const user = await authService.register(req.body);
    const { passwordHash, ...userWithoutPassword } = user;
    res.status(201).json(userWithoutPassword);
};

export const loginUser: RequestHandler = async (req, res) => {
    const tokens = await authService.login(req.body);
    res.status(200).json(tokens);
}

export const loginWithApple: RequestHandler = async (req, res) => {
    const tokens = await authService.loginWithApple(req.body);
    res.status(200).json(tokens);
};

export const refreshToken: RequestHandler = async (req, res) => {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.status(200).json(tokens);
};

export const logoutUser: RequestHandler = async (req, res) => {
    const userId = req.user?.id;
    if (typeof userId !== "string") {
        throw new AppError("Access denied", 401);
    }

    await authService.logout(userId);
    res.status(204).send();
};
