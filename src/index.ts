import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from 'express-rate-limit'
import type { Express } from "express";
import { logger } from "./utils/logger";
import { connectDatabase } from "./config/database";

// Routes import
import { healthRouter } from "./modules/health/health.routes";
import { userRouter } from "./modules/users/user.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { placeRouter } from "./modules/places/place.routes";

// Middlewares import
import { errorHandler } from "./middlewares/errorHandler";
import { validateAuthToken } from "./middlewares/validateAuthToken";

const PORT = process.env.PORT || 8000;

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        logger.error(`Missing required environment variable: ${name}`);
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
})

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

// Error handler must be registered after the routes
app.use(errorHandler);

connectDatabase().then(() => {
  app.listen(PORT, (): void => {
    logger.info(`Server is running on port ${PORT}`);
  });
});
