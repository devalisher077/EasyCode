// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), upload: vi.fn(), bucket: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getSession: mocks.session }, storage: { from: mocks.bucket } }),
}));
const session = (id = "teacher-1") => ({ data: { session: { user: { id }, access_token: "test-only" } } });
const original = { path: "classes/test/original.pdf", token: "temporary-original", contentType: "application/pdf" };
const preview = { path: "classes/test/preview.pdf", token: "temporary-preview", contentType: "application/pdf" };
const input = () => ({ classId: "class-1", sectionId: null, title: "Lesson", expectedUserId: "teacher-1", file: new File(["%PDF-test"], "lesson.pdf") });
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
let api: typeof import("./api");
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-only");
  mocks.session.mockReset().mockResolvedValue(session());
  mocks.upload.mockReset().mockResolvedValue({ error: null });
  mocks.bucket.mockReset().mockReturnValue({ uploadToSignedUrl: mocks.upload });
  fetchMock = vi.fn().mockResolvedValueOnce(json({ id: "material-1", bucket: "easycode-materials", original, preview: null }))
    .mockResolvedValueOnce(json({ material: { id: "material-1" } }));
  vi.stubGlobal("fetch", fetchMock);
  api = await import("./api");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uploads directly with the signed token before completing publication", async () => {
  const data = input();
  await expect(api.uploadClassMaterial(data)).resolves.toEqual({ material: { id: "material-1" } });
  expect(mocks.bucket).toHaveBeenCalledWith("easycode-materials");
  expect(mocks.upload).toHaveBeenCalledWith(original.path, original.token, data.file, { contentType: "application/pdf", upsert: false });
  expect(fetchMock.mock.calls[1][0]).toBe("/api/class-materials/material-1/complete");
  expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[1]);
});

it("does not publish a failed upload or leak its provider error", async () => {
  mocks.upload.mockResolvedValue({ error: { message: "private provider detail" } });
  await expect(api.uploadClassMaterial(input())).rejects.toThrow("Не удалось загрузить файл в хранилище.");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("stops before storage when the account changes after preparation", async () => {
  mocks.session.mockResolvedValueOnce(session()).mockResolvedValue(session("teacher-2"));
  await expect(api.uploadClassMaterial(input())).rejects.toMatchObject({ status: 409 });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not publish when the account changes during the upload", async () => {
  mocks.upload.mockImplementation(async () => { mocks.session.mockResolvedValue(session("teacher-2")); return { error: null }; });
  await expect(api.uploadClassMaterial(input())).rejects.toMatchObject({ status: 409 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("uploads the separate PDF before publishing PowerPoint", async () => {
  fetchMock.mockReset().mockResolvedValueOnce(json({ id: "material-1", bucket: "easycode-materials", original, preview }))
    .mockResolvedValueOnce(json({ material: { id: "material-1" } }));
  const data = { ...input(), file: new File(["PK-test"], "lesson.pptx"), preview: new File(["%PDF-test"], "lesson.pdf") };
  await api.uploadClassMaterial(data);
  expect(mocks.upload).toHaveBeenCalledTimes(2);
  expect(mocks.upload).toHaveBeenLastCalledWith(preview.path, preview.token, data.preview, { contentType: "application/pdf", upsert: false });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).previewSize).toBe(data.preview.size);
});

it("rejects unsupported, empty files and PowerPoint without a PDF before requesting upload", async () => {
  for (const file of [new File(["x"], "script.js"), new File([], "empty.pdf"), new File(["PK-test"], "lesson.pptx")]) {
    await expect(api.uploadClassMaterial({ ...input(), file })).rejects.toThrow();
  }
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
});
