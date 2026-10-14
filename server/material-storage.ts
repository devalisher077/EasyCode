import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MATERIAL_BUCKET, MAX_MATERIAL_BYTES, materialMime, type MaterialExtension, type StoredMaterial } from "../shared/materials.js";

export class MaterialStorageError extends Error {
  constructor(message: string, public statusCode = 503) { super(message); }
}
const unavailable = () => new MaterialStorageError("Хранилище материалов недоступно. Проверьте миграцию и Supabase Storage.");
const fields = "id,course_key,class_id,section_id,owner_id,title,filename,extension,storage_path,preview_path,size_bytes,preview_size_bytes,audience,status,created_at";
export class MaterialStorage {
  constructor(private client: SupabaseClient) {}
  async find(key: string, byCourse = false): Promise<StoredMaterial | null> {
    const { data, error } = await this.client.from("learning_materials").select(fields)
      .eq(byCourse ? "course_key" : "id", key).maybeSingle();
    if (error) throw unavailable();
    return data;
  }
  async list(classId: string): Promise<StoredMaterial[]> {
    const { data, error } = await this.client.from("learning_materials").select(fields)
      .eq("class_id", classId).eq("status", "ready").order("created_at");
    if (error) throw unavailable();
    return data || [];
  }
  async prepare(input: { classId: string; sectionId: string | null; ownerId: string;
    title: string; filename: string; extension: MaterialExtension; size: number; previewSize?: number }) {
    const { count, error: countError } = await this.client.from("learning_materials")
      .select("id", { count: "exact", head: true }).eq("class_id", input.classId);
    if (countError) throw unavailable();
    if ((count ?? 0) >= 100) throw new MaterialStorageError("В классе достигнут лимит материалов. Обратитесь к администратору.", 409);
    const id = randomUUID();
    const root = `classes/${input.classId}/${id}`;
    const original = `${root}/original.${input.extension}`;
    const preview = input.extension === "pdf" ? original : input.extension === "pptx" ? `${root}/preview.pdf` : null;
    const row: StoredMaterial = { id, course_key: null, class_id: input.classId,
      section_id: input.sectionId, owner_id: input.ownerId, title: input.title,
      filename: input.filename, extension: input.extension, storage_path: original,
      preview_path: preview, size_bytes: input.size,
      preview_size_bytes: input.extension === "pdf" ? input.size : input.previewSize ?? null,
      audience: "student_and_teacher", status: "pending", created_at: new Date().toISOString() };
    const { error } = await this.client.from("learning_materials").insert(row);
    if (error) throw unavailable();
    const upload = async (path: string, contentType: string) => {
      const { data, error } = await this.client.storage.from(MATERIAL_BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data) throw unavailable();
      return { path, token: data.token, contentType };
    };
    return { id, bucket: MATERIAL_BUCKET,
      original: await upload(original, materialMime[input.extension]),
      preview: preview && preview !== original ? await upload(preview, materialMime.pdf) : null };
  }
  async finish(row: StoredMaterial): Promise<StoredMaterial> {
    if (row.status === "ready") return row; // Safe retry after a lost response.
    await this.verify(row.storage_path, row.size_bytes, row.extension);
    if (row.preview_path && row.preview_path !== row.storage_path)
      await this.verify(row.preview_path, row.preview_size_bytes!, "pdf");
    const { data, error } = await this.client.from("learning_materials")
      .update({ status: "ready" }).eq("id", row.id).select(fields).single();
    if (error || !data) throw unavailable();
    return data;
  }
  private async verify(path: string, size: number, extension: MaterialExtension) {
    const { data, error } = await this.client.storage.from(MATERIAL_BUCKET).download(path);
    if (error || !data) throw new MaterialStorageError("Файл ещё не загружен. Повторите загрузку.", 409);
    if (data.size !== size || size > MAX_MATERIAL_BYTES || size < 1)
      throw new MaterialStorageError("Размер загруженного файла не совпадает с заявленным.", 400);
    const bytes = new Uint8Array(await data.slice(0, 5).arrayBuffer());
    const valid = extension === "pdf" ? String.fromCharCode(...bytes) === "%PDF-"
      : bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
    if (!valid) throw new MaterialStorageError("Содержимое файла не соответствует выбранному формату.", 400);
  }
  async link(row: StoredMaterial, preview: boolean) {
    if (row.status !== "ready") throw new MaterialStorageError("Материал ещё не опубликован.", 404);
    const path = preview ? row.preview_path : row.storage_path;
    if (!path) throw new MaterialStorageError("Для просмотра нужна PDF-копия презентации.", 404);
    const { data, error } = await this.client.storage.from(MATERIAL_BUCKET).createSignedUrl(path, 60,
      preview ? undefined : { download: row.filename });
    if (error || !data) throw unavailable();
    return data.signedUrl;
  }
}
