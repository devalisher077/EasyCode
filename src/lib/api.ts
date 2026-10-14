import { createClient } from "@supabase/supabase-js";
import { MAX_MATERIAL_BYTES, materialMime, type MaterialExtension, type ClassMaterial } from "../../shared/materials";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
let demoRole: "student" | "teacher" = "student";
export function setDemoRole(role: "student" | "teacher") {
  demoRole = role;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type ApiOptions = { anonymous?: boolean; expectedUserId?: string };
async function headers(options: ApiOptions = {}) {
  // Snapshot the demo role before awaiting a session so an account/role switch
  // cannot move an already-started progress operation to a different owner.
  const requestRole = demoRole;
  if (options.anonymous) return { "Content-Type": "application/json" };
  const session = supabase
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (options.expectedUserId && session?.user.id !== options.expectedUserId)
    throw new ApiError("Аккаунт изменился. Открой тему заново.", 409);
  const token = session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "x-demo-role": requestRole,
  };
}
export async function api<T>(
  path: string,
  body?: unknown,
  options?: ApiOptions,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: await headers(options),
    credentials: options?.anonymous ? "omit" : "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.message || data.error || "Не удалось выполнить запрос",
      response.status,
    );
  return data as T;
}
export async function downloadMaterial(path: string) {
  let response = await fetch(
    `/api/materials?path=${encodeURIComponent(path)}`,
    { headers: await headers() },
  );
  if (!response.ok) throw new Error("Материал недоступен для этой роли");
  response = await storageResponse(response);
  if (!response.ok) throw new Error("Не удалось скачать материал.");
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = path.split("/").at(-1) || "Материал";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** The API returns a short-lived private Storage URL in production. Never forward
 * the user's Authorization/custom headers to the storage host. */
async function storageResponse(response: Response, signal?: AbortSignal) {
  if (!response.headers.get("content-type")?.includes("application/json")) return response;
  const link = await response.json();
  const target = new URL(link.url);
  if (!url || target.origin !== new URL(url).origin || target.username || target.password ||
    !target.pathname.startsWith("/storage/v1/object/sign/easycode-materials/"))
    throw new Error("Недопустимый адрес материала.");
  return fetch(target.href, { credentials: "omit", cache: "no-store", signal });
}

export async function uploadClassMaterial(input: { classId: string; sectionId: string | null;
  title: string; file: File; preview?: File; expectedUserId: string }) {
  if (!supabase) throw new Error("Загрузка файлов доступна после подключения Supabase.");
  const extension = input.file.name.split(".").at(-1)?.toLowerCase() as MaterialExtension;
  if (!(extension in materialMime)) throw new Error("Выберите PDF, PPTX или DOCX.");
  for (const file of [input.file, input.preview].filter((file): file is File => Boolean(file))) {
    if (file.size < 1 || file.size > MAX_MATERIAL_BYTES) throw new Error("Размер каждого файла должен быть от 1 байта до 20 МБ.");
  }
  if (extension === "pptx" && (!input.preview || !input.preview.name.toLowerCase().endsWith(".pdf")))
    throw new Error("Для PowerPoint загрузите оригинал PPTX и PDF-копию для просмотра.");
  const options = { expectedUserId: input.expectedUserId };
  type Target = { path: string; token: string; contentType: string };
  const draft = await api<{ id: string; bucket: string; original: Target; preview: Target | null }>("/class-materials/uploads", {
    classId: input.classId, sectionId: input.sectionId, title: input.title,
    filename: input.file.name, extension, size: input.file.size,
    ...(extension === "pptx" ? { previewSize: input.preview!.size } : {}),
  }, options);
  await headers(options); // Do not continue an upload after an account switch.
  const put = async (target: Target, file: File) => {
    const { error } = await supabase!.storage.from(draft.bucket).uploadToSignedUrl(target.path, target.token,
      file, { contentType: target.contentType, upsert: false });
    if (error) throw new Error("Не удалось загрузить файл в хранилище. Повторите попытку.");
  };
  await put(draft.original, input.file);
  if (draft.preview) {
    await headers(options);
    await put(draft.preview, input.preview!);
  }
  return api<{ material: ClassMaterial }>(`/class-materials/${draft.id}/complete`, {}, options);
}

/** Keep protected presentations out of public URLs, caches and local storage. */
export async function loadMaterialPreview(
  path: string,
  options: { signal: AbortSignal; expectedUserId?: string },
): Promise<Uint8Array> {
  const requestRole = demoRole;
  const requestHeaders = await headers(options);
  options.signal.throwIfAborted();
  let response = await fetch(
    `/api/materials/preview?path=${encodeURIComponent(path)}`,
    {
      headers: requestHeaders,
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal,
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.message || data.error || "Не удалось открыть презентацию.",
      response.status,
    );
  }
  response = await storageResponse(response, options.signal);
  if (!response.ok) throw new ApiError("Не удалось открыть презентацию.", response.status);
  if (!response.headers.get("content-type")?.includes("application/pdf"))
    throw new ApiError("Файл для просмотра ещё не подготовлен.", 415);
  const bytes = new Uint8Array(await response.arrayBuffer());
  options.signal.throwIfAborted();
  // Re-check after reading the response: never show material delivered for a
  // previous account if an authentication or demo-role switch happened in flight.
  if (requestRole !== demoRole)
    throw new ApiError("Аккаунт изменился. Открой материал заново.", 409);
  if (options.expectedUserId) await headers(options);
  options.signal.throwIfAborted();
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-")
    throw new ApiError("Не удалось прочитать файл презентации.", 415);
  return bytes;
}
