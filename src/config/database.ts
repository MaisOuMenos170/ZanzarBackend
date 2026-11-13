import mongoose from "mongoose";
import { resolveMongoUri, redactMongoUri } from "./resolveMongoUri";
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
    const rawUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/Zanzardb";
    const uri = resolveMongoUri(rawUri);

    registerConnectionListeners();

    if (rawUri.startsWith("mongodb+srv://") && uri.startsWith("mongodb://")) {
        log.info("Using standard MongoDB URI (bypasses DNS SRV lookup)");
    }

    try {
        await mongoose.connect(uri);
        log.info(
            { host: mongoose.connection.host, db: mongoose.connection.name },
            "MongoDB connected",
        );
    } catch (error) {
        log.error({ err: error, uri: redactMongoUri(uri) }, "MongoDB wasn't able to connect");
        throw error;
    }
}
