import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { Store } from "./store.js";
import type { FastifyInstance } from "fastify";
import { publicMaterial, type StoredMaterial } from "../shared/materials.js";
const mock = vi.hoisted(() => ({ find: vi.fn(), list: vi.fn(), prepare: vi.fn(), finish: vi.fn(), link: vi.fn() }));
vi.mock("./material-storage.js", async original => ({
  ...await original<typeof import("./material-storage.js")>(),
  MaterialStorage: class { find = mock.find; list = mock.list; prepare = mock.prepare; finish = mock.finish; link = mock.link; },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: {
  getUser: async (token: string) => ({ data: { user: { id: token } }, error: null }),
} }) }));
const teacherId = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";
const otherId = "44444444-4444-4444-8444-444444444444";
const classId = "33333333-3333-4333-8333-333333333333";
const material: StoredMaterial = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", class_id: classId,
  course_key: null, section_id: null, owner_id: teacherId, title: "PDF", filename: "тест.pdf", extension: "pdf",
  storage_path: "private/original.pdf", preview_path: "private/original.pdf", size_bytes: 8,
  preview_size_bytes: 8, audience: "student_and_teacher", status: "ready", created_at: "2026-10-14T00:00:00Z" };
const origin = "https://easy-code-nu.vercel.app";
const auth = (id: string) => ({ authorization: `Bearer ${id}`, origin });
const input = { classId, title: "PDF", filename: "тест.pdf", extension: "pdf", size: 8 };
let app: FastifyInstance;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(Store.prototype, "getProfile").mockImplementation(async id => ({ id, name: "Test", role: id === studentId ? "student" : "teacher" }));
  vi.spyOn(Store.prototype, "classById").mockImplementation(async id => id === classId ? { id, teacher_id: teacherId, name: "4 А", join_code: "TEST", created_at: "" } : null);
  vi.spyOn(Store.prototype, "isMember").mockImplementation(async (id, user) => id === classId && user === studentId);
  vi.spyOn(Store.prototype, "listSections").mockResolvedValue([]);
  mock.find.mockResolvedValue(material); mock.list.mockResolvedValue([material]);
  mock.prepare.mockResolvedValue({ id: material.id }); mock.finish.mockResolvedValue(material);
  mock.link.mockResolvedValue("https://example.supabase.co/storage/v1/object/sign/easycode-materials/test?token=fake");
  app = await createApp({ demo: false, host: "127.0.0.1", port: 3001, frontendOrigin: origin,
    supabaseUrl: "https://example.supabase.co", supabaseServiceRoleKey: "test-server-key", openaiApiKey: "", openaiModel: "" });
});
afterEach(async () => { await app.close(); vi.restoreAllMocks(); });
describe("class material authorization", () => {
  it("lets members list and view but not upload; denies other teachers", async () => {
    const list = await app.inject({ url: `/api/class-materials?classId=${classId}`, headers: auth(studentId) });
    expect(list.statusCode).toBe(200);
    expect(list.json().materials).toEqual([publicMaterial(material)]);
    expect(list.body).not.toContain("storage_path");
    for (const user of [studentId, otherId]) {
      expect((await app.inject({ method: "POST", url: "/api/class-materials/uploads", headers: auth(user), payload: input })).statusCode).toBe(403);
    }
    const url = `/api/materials/preview?path=${encodeURIComponent(publicMaterial(material).path)}`;
    expect((await app.inject({ url, headers: auth(studentId) })).statusCode).toBe(200);
    mock.link.mockClear();
    expect((await app.inject({ url, headers: auth(otherId) })).statusCode).toBe(403);
    expect(mock.link).not.toHaveBeenCalled();
  });
  it("validates size, extension, preview and lesson ownership before signing", async () => {
    for (const extra of [{ size: 21 * 1024 * 1024 }, { filename: "../../test.pdf" }, { storage_path: "other/file" },
      { filename: "file.pptx", extension: "pptx" }, { sectionId: material.id }]) {
      expect((await app.inject({ method: "POST", url: "/api/class-materials/uploads", headers: auth(teacherId), payload: { ...input, ...extra } })).statusCode).toBe(400);
    }
    expect(mock.prepare).not.toHaveBeenCalled();
    expect((await app.inject({ method: "POST", url: "/api/class-materials/uploads", headers: auth(teacherId), payload: input })).statusCode).toBe(200);
    expect(mock.prepare).toHaveBeenCalledWith(expect.objectContaining({ ownerId: teacherId, classId }));
  });
  it("does not publish another teacher's upload or expose pending/private materials", async () => {
    expect((await app.inject({ method: "POST", url: `/api/class-materials/${material.id}/complete`, headers: auth(otherId), payload: {} })).statusCode).toBe(404);
    expect(mock.finish).not.toHaveBeenCalled();
    const url = `/api/materials/preview?path=${encodeURIComponent(publicMaterial(material).path)}`;
    mock.find.mockResolvedValueOnce({ ...material, status: "pending" });
    expect((await app.inject({ url, headers: auth(studentId) })).statusCode).toBe(404);
    mock.find.mockResolvedValueOnce({ ...material, audience: "teacher" });
    expect((await app.inject({ url, headers: auth(studentId) })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/class-materials/${material.id}/complete`, headers: auth(teacherId), payload: {} })).statusCode).toBe(200);
  });
  it("requires login for course files and resolves legacy catalog paths through the database", async () => {
    const key = "section-01/topic-01/Презентация.pptx";
    const url = `/api/materials/preview?path=${encodeURIComponent(key)}`;
    expect((await app.inject(url)).statusCode).toBe(401);
    mock.find.mockResolvedValueOnce({ ...material, class_id: null, owner_id: null, course_key: key });
    const result = await app.inject({ url, headers: auth(studentId) });
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toContain("no-store");
    expect(mock.find).toHaveBeenCalledWith(key, true);
    expect(result.json()).toEqual({ url: expect.stringContaining("/storage/v1/object/sign/") });
  });
});
