import mongoose from "mongoose";
import { logger } from "../utils/logger";

export async function connectDatabase() {
    const uri = process.env.MONGODB_URI || "mongodb:";

    try {
        await mongoose.connect(uri);
        logger.info(`MongoDB connected at ${uri}`);
    } catch (error) {
        logger.error(`MongoDB wasn't able to connect at ${uri}`);
        throw error;
    }
}