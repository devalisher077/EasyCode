import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MaterialStorage } from "./material-storage.js";
import { MATERIAL_BUCKET, type StoredMaterial } from "../shared/materials.js";

export const fixture: StoredMaterial = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", course_key: null,
  class_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", section_id: null,
  owner_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Слайды", filename: "Слайды.pdf",
  extension: "pdf", storage_path: "classes/test/original.pdf", preview_path: "classes/test/original.pdf",
  size_bytes: 8, preview_size_bytes: 8, audience: "student_and_teacher", status: "pending", created_at: "2026-10-14T00:00:00Z",
};
let results: unknown[];
let chains: any[];
let client: SupabaseClient;
let storage: { download: ReturnType<typeof vi.fn>; createSignedUrl: ReturnType<typeof vi.fn>; createSignedUploadUrl: ReturnType<typeof vi.fn> };
let service: MaterialStorage;
beforeEach(() => {
  results = []; chains = [];
  const from = vi.fn(() => {
    const result = results.shift() ?? { error: null };
    const chain: any = { then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) };
    for (const method of ["select", "eq", "order", "insert", "update", "single", "maybeSingle"])
      chain[method] = vi.fn(() => chain);
    chains.push(chain); return chain;
  });
  storage = { download: vi.fn().mockResolvedValue({ data: new Blob(["%PDF-1.7"]), error: null }),
    createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { token: "test-upload-token" }, error: null }),
    createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.supabase.co/signed" }, error: null }) };
  client = { from, storage: { from: vi.fn(() => storage) } } as unknown as SupabaseClient;
  service = new MaterialStorage(client);
});
describe("private material storage", () => {
  it("generates immutable server-owned paths and pending rows before signing", async () => {
    results.push({ count: 0, error: null }, { error: null });
    const prepared = await service.prepare({ classId: fixture.class_id!, sectionId: null, ownerId: fixture.owner_id!,
      title: "Презентация", filename: "Презентация.pptx", extension: "pptx", size: 12, previewSize: 8 });
    const row = chains[1].insert.mock.calls[0][0];
    expect(row.status).toBe("pending");
    expect(row.storage_path).toBe(`classes/${fixture.class_id}/${prepared.id}/original.pptx`);
    expect(row.preview_path).toBe(`classes/${fixture.class_id}/${prepared.id}/preview.pdf`);
    expect(row.owner_id).toBe(fixture.owner_id);
    expect(client.storage.from).toHaveBeenCalledWith(MATERIAL_BUCKET);
    expect(storage.createSignedUploadUrl).toHaveBeenCalledTimes(2);
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(row.storage_path, { upsert: false });
  });
  it("never publishes absent, size-mismatched or spoofed files", async () => {
    storage.download.mockResolvedValueOnce({ data: null, error: {} });
    await expect(service.finish(fixture)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.finish({ ...fixture, size_bytes: 9 })).rejects.toMatchObject({ statusCode: 400 });
    storage.download.mockResolvedValueOnce({ data: new Blob(["notapdf!"]), error: null });
    await expect(service.finish(fixture)).rejects.toMatchObject({ statusCode: 400 });
    expect(client.from).not.toHaveBeenCalled();
  });
  it("checks the PDF companion too and only then publishes; completion is idempotent", async () => {
    results.push({ data: { ...fixture, status: "ready" }, error: null });
    const row = { ...fixture, extension: "pptx" as const, storage_path: "original.pptx", size_bytes: 4 };
    storage.download.mockResolvedValueOnce({ data: new Blob([new Uint8Array([80, 75, 3, 4])]), error: null });
    const published = await service.finish(row);
    expect(storage.download).toHaveBeenCalledTimes(2);
    expect(chains[0].update).toHaveBeenCalledWith({ status: "ready" });
    expect(published.status).toBe("ready");
    await service.finish(published);
    expect(storage.download).toHaveBeenCalledTimes(2);
  });
  it("issues short-lived preview/download links only for ready records", async () => {
    await expect(service.link(fixture, true)).rejects.toMatchObject({ statusCode: 404 });
    const row = { ...fixture, status: "ready" as const };
    await service.link(row, true);
    expect(storage.createSignedUrl).toHaveBeenCalledWith(row.preview_path, 60, undefined);
    await service.link(row, false);
    expect(storage.createSignedUrl).toHaveBeenCalledWith(row.storage_path, 60, { download: row.filename });
  });
  it("does not leak SDK failures and enforces the class material cap", async () => {
    results.push({ error: { message: "secret-in-sdk-error" } });
    await expect(service.find(fixture.id)).rejects.not.toThrow("secret-in-sdk-error");
    results.push({ count: 100, error: null });
    await expect(service.prepare({ classId: fixture.class_id!, sectionId: null, ownerId: fixture.owner_id!,
      title: "PDF", filename: "test.pdf", extension: "pdf", size: 8 })).rejects.toMatchObject({ statusCode: 409 });
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
