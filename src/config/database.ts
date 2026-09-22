import mongoose from "mongoose";
import { logger } from "../utils/logger";

export async function connectDatabase() {
    await mongoose.connect(process.env.MONGODB_URI!);
    logger.info(`MongoDB connected at ${process.env.MONGODB_URI}`);
}