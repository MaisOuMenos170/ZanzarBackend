import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from 'express-rate-limit'
import type { Express } from "express";
import { logger } from "./utils/logger";
import { connectDatabase } from "./config/database";

// Routes import
import { healthRouter } from "./routes/health.routes";
import { userRouter } from "./routes/user.routes";

// Middlewares import
import { errorHandler } from "./middlewares/errorHandler";

const PORT = process.env.PORT || 8000;
const app: Express = express();

// Config
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per window per IP
  standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
})

app.use(limiter);
app.use(errorHandler);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());
app.use(helmet())

// Routes
app.use(healthRouter);
app.use(userRouter);

connectDatabase().then(() => {
  app.listen(PORT, (): void => {
    logger.info(`Server is running on port ${PORT}`);
  });
});