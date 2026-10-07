import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const config: AppConfig = { demo: true, host: "127.0.0.1", port: 3001, frontendOrigin: "http://localhost:5173", supabaseUrl: "", supabaseServiceRoleKey: "", openaiApiKey: "", openaiModel: "" };
const teacher = { "x-demo-role": "teacher" };
const original = "section-01/topic-01/Презентация.pptx";
const pdfPath = path.resolve("content/materials/section-01/topic-01/Презентация.pdf");
const privateOriginal = "private-test/Презентация учителя.pptx";
const privatePdfPath = path.resolve("content/materials/private-test/Презентация учителя.pdf");
const pdfBytes = Buffer.from("%PDF-1.7\n%%EOF\n");
const url = (source = original) => `/api/materials/preview?path=${encodeURIComponent(source)}`;
const apps: FastifyInstance[] = [];
let missing = false;
let fixtureReads: string[] = [];

beforeEach(async () => {
  missing = false;
  fixtureReads = [];
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  const catalogPath = path.resolve("content/materials/catalog.json");
  const catalog = JSON.parse(await actual.readFile(catalogPath, "utf8"));
  // A teacher-only presentation fixture tests audience rules without modifying
  // the real catalog or requiring the concurrently exported PDFs to exist.
  catalog.sections[0].topics[0].materials.push({ type: "presentation", audience: "teacher", path: privateOriginal });
  vi.mocked(readFile).mockImplementation((async (file: Parameters<typeof readFile>[0], options?: unknown) => {
    const filePath = String(file);
    if (filePath === catalogPath) return JSON.stringify(catalog);
    if (filePath === pdfPath || filePath === privatePdfPath) {
      fixtureReads.push(filePath);
      if (missing) throw Object.assign(new Error("Fixture PDF is missing"), { code: "ENOENT" });
      return pdfBytes;
    }
    return actual.readFile(file, options as Parameters<typeof readFile>[1]);
  }) as typeof readFile);
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
  vi.clearAllMocks();
});
async function setup(demo = true) {
  const app = await createApp(demo ? config : { ...config, demo: false, supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "test-server-key" });
  apps.push(app); return app;
}

describe("authenticated presentation previews", () => {
  it("serves only the prepared same-folder PDF with private inline headers", async () => {
    const app = await setup();
    const response = await app.inject(url());
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(pdfBytes);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe(`inline; filename*=UTF-8''${encodeURIComponent("Презентация.pdf")}`);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(fixtureReads).toEqual([pdfPath]);
  });

  it("preserves the original download endpoint and attachment headers", async () => {
    const app = await setup();
    const response = await app.inject(`/api/materials?path=${encodeURIComponent(original)}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("presentationml.presentation");
    expect(response.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(response.rawPayload.subarray(0, 2).toString()).toBe("PK");
    expect(fixtureReads).toEqual([]);
  });

  it("requires real authentication outside demo and never accepts a demo-role bypass", async () => {
    const app = await setup(false);
    expect((await app.inject(url())).statusCode).toBe(401);
    expect((await app.inject({ url: url(), headers: teacher })).statusCode).toBe(401);
    expect(fixtureReads).toEqual([]);
  });

  it("enforces teacher-only presentation access before reading any preview bytes", async () => {
    const app = await setup();
    expect((await app.inject(url(privateOriginal))).statusCode).toBe(403);
    expect(fixtureReads).toEqual([]);
    const allowed = await app.inject({ url: url(privateOriginal), headers: teacher });
    expect(allowed.statusCode).toBe(200);
    expect(fixtureReads).toEqual([privatePdfPath]);
  });

  it("rejects unknown paths, direct PDF paths, traversal, URLs and non-PPTX materials", async () => {
    const app = await setup();
    for (const source of [
      original.replace(/\.pptx$/, ".pdf"), "../../.env", "/etc/passwd",
      "https://example.test/slides.pdf", "unknown/Презентация.pptx",
      "section-01/topic-01/../topic-01/Презентация.pptx",
    ]) expect((await app.inject(url(source))).statusCode).toBe(404);
    expect((await app.inject({ url: url("course-plan/План разделов.docx"), headers: teacher })).statusCode).toBe(404);
    expect((await app.inject(url("section-01/topic-01/Конспект для учителя.docx"))).statusCode).toBe(403);
    expect((await app.inject(`${url()}&pdf=../../.env`)).statusCode).toBe(400);
    expect(fixtureReads).toEqual([]);
  });

  it("returns a friendly 404 when the prepared PDF is not available", async () => {
    missing = true;
    const app = await setup();
    const response = await app.inject(url());
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain("ещё не подготовлен");
    expect(response.json().error).toContain("скачать оригинал PPTX");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().error).not.toContain("content/materials");
  });
});
