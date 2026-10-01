import mongoose from "mongoose";
import { logger } from "../utils/logger";

const log = logger.child({ module: "database" });

let listenersRegistered = false;

function registerConnectionListeners() {
    if (listenersRegistered) return;
    listenersRegistered = true;

    mongoose.connection.on("error", (err) => log.error({ err }, "MongoDB connection error"));
    mongoose.connection.on("disconnected", () => log.warn("MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => log.info("MongoDB reconnected"));
}

export async function connectDatabase() {
    const uri = process.env.MONGODB_URI || "mongodb:";

    registerConnectionListeners();
    // The URI is never logged: for Atlas it contains the credentials.
    log.info("Connecting to MongoDB");

    try {
        await mongoose.connect(uri);
        log.info(
            { host: mongoose.connection.host, db: mongoose.connection.name },
            "MongoDB connected",
        );
    } catch (error) {
        log.error({ err: error }, "MongoDB wasn't able to connect");
        throw error;
    }
}
