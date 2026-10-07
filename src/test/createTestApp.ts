import express from "express";
import { placeRouter } from "../modules/places/place.routes.js";
import { errorHandler } from "../middlewares/errorHandler.js";

export function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(placeRouter);
    app.use(errorHandler);
    return app;
}
