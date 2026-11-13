import { afterAll, afterEach, beforeEach, vi } from "vitest";
import { afterDone, cookieJar, requestHeaders } from "./next-fakes";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", async () => (await import("./next-fakes")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./next-fakes")).nextNavigation);
vi.mock("next/server", async () => (await import("./next-fakes")).nextServer);
vi.mock("next/cache", async () => (await import("./next-fakes")).nextCache);

beforeEach(() => {
  cookieJar.clear();
  for (const name of Object.keys(requestHeaders)) delete requestHeaders[name];
});

// Work a test queued with after() and never ran must not spill into the next test's database.
afterEach(async () => {
  await afterDone();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// src/lib/db keeps its pool on globalThis; close it so the worker can exit.
afterAll(async () => {
  await (globalThis as { __ttdPool?: { end(): Promise<void> } }).__ttdPool?.end();
});
