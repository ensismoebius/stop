import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/**
 * Prepara o banco de testes. Requer um MySQL/MariaDB acessivel em
 * DATABASE_URL (veja README: `docker compose up -d mysql`).
 *
 * Uma variavel exportada no shell tem precedencia sobre o `.env.test`,
 * permitindo `DATABASE_URL=... npm test` sem editar arquivos.
 */
export default function setup() {
  const envFile = path.join(root, ".env.test");
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
  process.env.NODE_ENV = "test";

  execSync("npx prisma migrate deploy", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  });
}
