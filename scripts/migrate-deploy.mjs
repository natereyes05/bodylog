import { spawnSync } from "node:child_process";

// Prefer an unpooled connection for migrations (Neon's pooled DATABASE_URL
// goes through pgbouncer, which can break Prisma's migration advisory locks).
// Falls through to whatever DATABASE_URL is already set to otherwise —
// locally that's loaded from .env by prisma.config.ts itself.
const env = { ...process.env };
if (env.DATABASE_URL_UNPOOLED) {
  env.DATABASE_URL = env.DATABASE_URL_UNPOOLED;
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
