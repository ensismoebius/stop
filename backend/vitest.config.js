import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, ".env.test");
const testEnv = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};

export default defineConfig({
  test: {
    environment: "node",
    // Os testes de integracao compartilham o mesmo banco: sem paralelismo.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ["./tests/globalSetup.js"],
    include: ["tests/**/*.test.js"],
    // O `.env.test` define os padroes; o que ja estiver exportado no shell
    // (tipicamente DATABASE_URL) continua valendo.
    env: {
      NODE_ENV: "test",
      ...testEnv,
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.js"],
      exclude: ["src/lib/prisma.js", "**/generated/**"],
      all: true,
    },
  },
});
