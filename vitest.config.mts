import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests run against a real Postgres. The database is wiped before each run, so it must be a
// separate one whose name ends in "_test" (checked in tests/global-setup.ts).
// Locally: docker compose up -d (the test database is created automatically).
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ttd:ttd@localhost:54329/ttd_test";
process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    env: { DATABASE_URL: testDatabaseUrl },
    // The files share one database.
    fileParallelism: false,
  },
});
