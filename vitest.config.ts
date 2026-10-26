import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.vitest.ts"],
        env: {
            NODE_ENV: "test",
            JWT_SECRET: "test-jwt-secret",
            JWT_REFRESH_SECRET: "test-jwt-refresh-secret",
            MONGODB_URI: "mongodb://127.0.0.1:27017/Zanzardb-test",
        },
    },
});
