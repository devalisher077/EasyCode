// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getSession: mocks.getSession } })),
}));
let api: typeof import("./api");
let fetchMock: ReturnType<typeof vi.fn>;
const session = (id: string) => ({
  data: {
    session: { user: { id }, access_token: "test-token-not-a-real-secret" },
  },
});
const pdfResponse = () =>
  new Response("%PDF-1.7 test", {
    status: 200,
    headers: { "Content-Type": "application/pdf" },
  });
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-not-a-real-secret");
  mocks.getSession.mockReset().mockResolvedValue(session("student-1"));
  fetchMock = vi.fn(async () => pdfResponse());
  vi.stubGlobal("fetch", fetchMock);
  api = await import("./api");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("loadMaterialPreview", () => {
  it("fetches a signed Storage URL without forwarding account headers or cookies", async () => {
    const signed = "https://example.supabase.co/storage/v1/object/sign/easycode-materials/course/test/preview.pdf?token=temporary";
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ url: signed }), { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(pdfResponse());
    const controller = new AbortController();
    const bytes = await api.loadMaterialPreview("lesson.pptx", { signal: controller.signal, expectedUserId: "student-1" });
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe("%PDF-");
    expect(fetchMock).toHaveBeenNthCalledWith(2, signed, { credentials: "omit", cache: "no-store", signal: controller.signal });
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("rejects a signed-link response pointing outside the configured private bucket", async () => {
    for (const url of ["https://attacker.example/file.pdf", "https://example.supabase.co/storage/v1/object/public/other/file.pdf"]) {
      fetchMock.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({ url }), { headers: { "content-type": "application/json" } }));
      await expect(api.loadMaterialPreview("lesson.pptx", { signal: new AbortController().signal, expectedUserId: "student-1" }))
        .rejects.toThrow("Недопустимый адрес материала.");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });
  it("uses a protected same-origin request without credentials in the URL or browser cache", async () => {
    const abort = new AbortController();
    const bytes = await api.loadMaterialPreview("1.1/Алгоритм.pptx", {
      signal: abort.signal,
      expectedUserId: "student-1",
    });
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe("%PDF-");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/materials/preview?path=${encodeURIComponent("1.1/Алгоритм.pptx")}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token-not-a-real-secret",
          "x-demo-role": "student",
        },
        credentials: "same-origin",
        cache: "no-store",
        signal: abort.signal,
      },
    );
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });

  it("rejects when the active account changes during PDF loading", async () => {
    mocks.getSession
      .mockResolvedValueOnce(session("student-1"))
      .mockResolvedValueOnce(session("student-2"));
    await expect(
      api.loadMaterialPreview("lesson.pptx", {
        signal: new AbortController().signal,
        expectedUserId: "student-1",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("does not send a request if the expected account is no longer signed in", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(
      api.loadMaterialPreview("lesson.pptx", {
        signal: new AbortController().signal,
        expectedUserId: "student-1",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a response belonging to an earlier demo role", async () => {
    fetchMock.mockImplementationOnce(async () => {
      api.setDemoRole("teacher");
      return pdfResponse();
    });
    await expect(
      api.loadMaterialPreview("lesson.pptx", {
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("reports a missing preview instead of parsing error JSON as PDF", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Предпросмотр не подготовлен" }), {
        status: 404,
      }),
    );
    await expect(
      api.loadMaterialPreview("lesson.pptx", {
        signal: new AbortController().signal,
        expectedUserId: "student-1",
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Предпросмотр не подготовлен",
    });
  });

  it.each([
    new Response("<html>Not a PDF</html>", {
      headers: { "Content-Type": "text/html" },
    }),
    new Response("Invalid data", {
      headers: { "Content-Type": "application/pdf" },
    }),
  ])("rejects invalid PDF responses", async (response) => {
    fetchMock.mockResolvedValueOnce(response);
    await expect(
      api.loadMaterialPreview("lesson.pptx", {
        signal: new AbortController().signal,
        expectedUserId: "student-1",
      }),
    ).rejects.toMatchObject({ status: 415 });
  });

  it("never starts a fetch after the viewer has already closed", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      api.loadMaterialPreview("lesson.pptx", {
        signal: abort.signal,
        expectedUserId: "student-1",
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
