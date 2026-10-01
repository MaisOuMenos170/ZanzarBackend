import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from 'express-rate-limit'
import type { Express } from "express";
import { logger } from "./utils/logger";
import { connectDatabase, disconnectDatabase } from "./config/database";

// Routes import
import { healthRouter } from "./modules/health/health.routes";
import { userRouter } from "./modules/users/user.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { placeRouter } from "./modules/places/place.routes";
import { checkInRouter } from "./modules/checkin/checkin.routes";
import { ratingRouter } from "./modules/rating/rating.routes";
import { stampsRouter } from "./modules/stamps/stamps.routes";

// Middlewares import
import { errorHandler } from "./middlewares/errorHandler";
import { validateAuthToken } from "./middlewares/validateAuthToken";
import { requestLogger } from "./middlewares/requestLogger";
import { rateLimitHandler } from "./middlewares/rateLimiters";

const PORT = process.env.PORT || 8000;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    logger.fatal({ variable: name }, "Missing required environment variable");
    process.exit(1);
  }
  return value;
}

requireEnv("JWT_SECRET");
requireEnv("MONGODB_URI");

const app: Express = express();

app.set("trust proxy", 1);

// Config
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per window per IP
  standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
  handler: rateLimitHandler("global"),
})

// Must be first so every request (including rate-limited ones) gets a request id and an access log line
app.use(requestLogger);
app.use(limiter);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());
app.use(helmet())

// Routes
app.use(healthRouter);
app.use(authRouter);
app.use(placeRouter);
app.use(validateAuthToken, userRouter);
app.use(validateAuthToken, checkInRouter);
app.use(validateAuthToken, ratingRouter);
app.use(validateAuthToken, stampsRouter);

// Error handler must be registered after the routes
app.use(errorHandler);

connectDatabase()
  .then(() => {
    const server = app.listen(PORT, (err?: Error): void => {
      if (err) {
        logger.fatal({ err, port: PORT }, "Failed to bind server port");
        process.exit(1);
      }
      logger.info({ port: PORT, env: process.env.NODE_ENV }, "Server is running");
    });

    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.once(signal, () => {
        logger.info({ signal }, "Shutting down: finishing in-flight requests, then closing MongoDB");
        server.close(async () => {
          await disconnectDatabase();
          process.exit(0);
        });
        server.closeIdleConnections();
      });
    }
  })
  .catch((err) => {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
  });

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  process.exit(1); // keep Node's default behavior of crashing on unhandled rejections
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});
