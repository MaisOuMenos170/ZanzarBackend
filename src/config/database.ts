import mongoose from "mongoose";
import { resolveMongoUri } from "./resolve-mongo-uri";
import { logger } from "../utils/logger";

const log = logger.child({ module: "database" });

let listenersRegistered = false;
let closingIntentionally = false;

function registerConnectionListeners() {
    if (listenersRegistered) return;
    listenersRegistered = true;

    mongoose.connection.on("error", (err) => log.error({ err }, "MongoDB connection error"));
    mongoose.connection.on("disconnected", () => {
        if (closingIntentionally) log.info("MongoDB disconnected");
        else log.warn("MongoDB disconnected unexpectedly");
    });
    mongoose.connection.on("reconnected", () => log.info("MongoDB reconnected"));
}

export async function disconnectDatabase() {
    closingIntentionally = true;
    await mongoose.connection.close();
    log.info("MongoDB connection closed");
}

export async function connectDatabase() {
    const rawUri = process.env.MONGODB_URI || "mongodb:";
    const uri = resolveMongoUri(rawUri);

    registerConnectionListeners();
    // The URI is never logged: for Atlas it contains the credentials.
    log.info("Connecting to MongoDB");
    if (rawUri.startsWith("mongodb+srv://") && uri !== rawUri) {
        log.info("Using MONGODB_URI_STANDARD (avoids querySrv EBADRESP on local DNS)");
    }

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
