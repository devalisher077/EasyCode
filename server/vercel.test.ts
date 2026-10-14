import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import inject from "light-my-request";
import Fastify, { type FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { loadConfig, type AppConfig } from "./config.js";
import { lessons } from "../content/lessons/index.js";
import deployment from "../vercel.json" with { type: "json" };

vi.mock("./config.js", async (original) => ({
  ...await original<typeof import("./config.js")>(),
  loadConfig: vi.fn(),
}));
vi.mock("./app.js", async (original) => {
  const actual = await original<typeof import("./app.js")>();
  return { ...actual, createApp: vi.fn(actual.createApp) };
});

const origin = "https://easy-code-nu.vercel.app";
const config: AppConfig = {
  demo: false, host: "127.0.0.1", port: 3001, frontendOrigin: origin,
  supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "test-server-key",
  openaiApiKey: "", openaiModel: "",
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.mocked(loadConfig).mockReturnValue({ ...config });
});
afterEach(async () => {
  for (const result of vi.mocked(createApp).mock.results) {
    if (result.type === "return") {
      const app = await (result.value as Promise<FastifyInstance>).catch(() => null);
      await app?.close();
    }
  }
  vi.restoreAllMocks();
});

describe("Vercel API entry point", () => {
  it("initializes once for concurrent requests and returns JSON without listening", async () => {
    const { default: handler } = await import("../api/index.js");
    const responses = await Promise.all(Array.from({ length: 3 }, () =>
      inject(handler, { url: "/api/health", headers: { origin } })));
    expect(createApp).toHaveBeenCalledTimes(1);
    const app = await vi.mocked(createApp).mock.results[0].value;
    expect(app.server.listening).toBe(false);
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ mode: "supabase", aiConfigured: false });
      expect(response.headers["cache-control"]).toContain("no-store");
    }
  });

  it("preserves JSON bodies, nested paths and server-side quiz checking", async () => {
    const { default: handler } = await import("../api/index.js");
    const lesson = lessons[0];
    const answers = Object.fromEntries(lesson.quiz.map(q => [q.id, q.correctOptionId]));
    const response = await inject(handler, {
      method: "POST", url: `/api/lessons/${lesson.id}/check`,
      headers: { origin, "content-type": "application/json" }, payload: { answers },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().result).toMatchObject({ passed: true });
    const oversized = await inject(handler, { method: "POST",
      url: `/api/lessons/${lesson.id}/check`, headers: { origin },
      payload: { answers, extra: "x".repeat(70_000) } });
    expect(oversized.statusCode).toBe(413);
  });

  it("keeps authentication, origin and private material checks in place", async () => {
    const { default: handler } = await import("../api/index.js");
    for (const url of ["/api/me", "/api/materials/preview?path=section-01%2Ftopic-01%2Ftest.pptx"]) {
      expect((await inject(handler, { url, headers: { origin } })).statusCode).toBe(401);
    }
    expect((await inject(handler, { method: "POST", url: "/api/classes",
      headers: { origin }, payload: { name: "Test" } })).statusCode).toBe(401);
    expect((await inject(handler, { url: "/api/catalog",
      headers: { origin: "https://untrusted.example" } })).statusCode).toBe(403);
    const catalog = await inject(handler, { url: "/api/catalog", headers: { origin } });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().sections).toHaveLength(6);
  });

  it("passes encoded query parameters, authorization and binary responses unchanged", async () => {
    const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 255, 128]);
    const file = "section-01/topic-01/Презентация.pptx";
    vi.mocked(createApp).mockImplementationOnce(async () => {
      const app = Fastify();
      app.get("/api/materials/preview", async (request, reply) => {
        expect(request.query).toEqual({ path: file });
        expect(request.headers.authorization).toBe("Bearer test-user-token");
        return reply.type("application/pdf").send(bytes);
      });
      return app;
    });
    const { default: handler } = await import("../api/index.js");
    const response = await inject(handler, {
      url: `/api/materials/preview?path=${encodeURIComponent(file)}`,
      headers: { authorization: "Bearer test-user-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.rawPayload).toEqual(bytes);
  });

  it("fails closed in demo mode and retries initialization without leaking details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadConfig).mockReturnValueOnce({ ...config, demo: true });
    const { default: handler } = await import("../api/index.js");
    const rejected = await inject(handler, { url: "/api/health" });
    expect(rejected.statusCode).toBe(503);
    expect(createApp).not.toHaveBeenCalled();
    expect(rejected.body).not.toContain("test-server-key");
    expect(log).toHaveBeenCalledOnce();
    expect((await inject(handler, { url: "/api/health" })).statusCode).toBe(200);
  });

  it("does not expose configuration errors in the response or logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadConfig).mockImplementationOnce(() => { throw new Error("sensitive-test-value"); });
    const { default: handler } = await import("../api/index.js");
    const response = await inject(handler, { url: "/api/health" });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("sensitive-test-value");
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive-test-value");
    expect((await inject(handler, { url: "/api/health" })).statusCode).toBe(200);
  });

  it("bundles only the catalog and keeps Storage files and API query parameters private", () => {
    expect(deployment.framework).toBe("vite");
    expect(deployment.outputDirectory).toBe("dist");
    expect(deployment.functions["api/index.ts"].includeFiles).toBe("content/materials/catalog.json");
    expect(deployment.functions["api/index.ts"].excludeFiles).toContain("content/materials/**/*.pdf");
    // An unnamed capture must not overwrite the material's ?path= query.
    expect(deployment.rewrites[0]).toEqual({ source: "/api/(.*)", destination: "/api" });
    expect(deployment.rewrites.slice(1).every(route => route.destination === "/index.html")).toBe(true);
    expect(deployment.rewrites.some(route => route.source.startsWith("/content"))).toBe(false);
  });
});
