export const MATERIAL_BUCKET = "easycode-materials";
export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;
export const materialMime = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type MaterialExtension = keyof typeof materialMime;
export interface StoredMaterial {
  id: string;
  course_key: string | null;
  class_id: string | null;
  section_id: string | null;
  owner_id: string | null;
  title: string;
  filename: string;
  extension: MaterialExtension;
  storage_path: string;
  preview_path: string | null;
  size_bytes: number;
  preview_size_bytes: number | null;
  audience: "student_and_teacher" | "teacher";
  status: "pending" | "ready";
  created_at: string;
}
export interface ClassMaterial {
  id: string;
  title: string;
  path: string;
  type: string;
  audience: string;
  section_id: string | null;
  filename: string;
  size_bytes: number;
}
export function publicMaterial(row: StoredMaterial): ClassMaterial {
  return { id: row.id, title: row.title, path: `cloud/${row.id}/${row.filename}`,
    type: row.preview_path ? "presentation" : "document", audience: row.audience,
    section_id: row.section_id, filename: row.filename, size_bytes: row.size_bytes };
}
