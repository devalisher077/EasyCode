import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const bucket = "easycode-materials";
const root = path.resolve("content/materials");
const mime = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const mode = process.argv[2] || "--dry-run";
class ImportError extends Error {}
const topicArg = process.argv[3] === "--topics" ? process.argv[4] : undefined;
if (
  !["--dry-run", "--upload"].includes(mode) ||
  (process.argv.length > 3 &&
    (process.argv.length !== 5 ||
      !topicArg ||
      !/^[1-6]\.[12](,[1-6]\.[12])*$/.test(topicArg)))
)
  throw new Error("Use --dry-run or --upload, optionally --topics 2.1,2.2.");
const topics = topicArg ? new Set(topicArg.split(",")) : null;

async function main() {
  const catalog = JSON.parse(
    await readFile(path.join(root, "catalog.json"), "utf8"),
  );
  const selected = catalog.sections
    .flatMap((section) => section.topics)
    .filter((topic) => !topics || topics.has(topic.number));
  if (topics && selected.length !== topics.size)
    throw new ImportError("Unknown topic selection.");
  const entries = selected.flatMap((topic) =>
    topic.materials
      .filter((material) => !topics || material.type === "presentation")
      .map((material) => ({
        ...material,
        title: `${topic.number} ${topic.title}`,
      })),
  );
  if (!topics)
    entries.push({
      path: "course-plan/План разделов.docx",
      title: "План разделов",
      audience: "teacher",
    });
  const unique = [
    ...new Map(entries.map((entry) => [entry.path, entry])).values(),
  ];
  const prepared = [];
  // Validate every local file before attempting any remote writes.
  for (const entry of unique) {
    const extension = entry.path.split(".").at(-1).toLowerCase();
    if (!(extension in mime))
      throw new ImportError("Unsupported material format.");
    const original = path.resolve(root, entry.path);
    if (!original.startsWith(root + path.sep))
      throw new ImportError("Material path outside source folder.");
    const bytes = await readFile(original);
    const pdf =
      extension === "pptx"
        ? await readFile(original.slice(0, -5) + ".pdf")
        : null;
    for (const value of [bytes, pdf].filter(Boolean))
      if (value.length < 1 || value.length > 20 * 1024 * 1024)
        throw new ImportError("File exceeds the 20 MB limit.");
    if (pdf && pdf.subarray(0, 5).toString() !== "%PDF-")
      throw new ImportError("Preview is not a PDF.");
    if (extension === "pdf") {
      if (bytes.subarray(0, 5).toString() !== "%PDF-")
        throw new ImportError("Source is not a PDF.");
    } else if (
      bytes[0] !== 0x50 ||
      bytes[1] !== 0x4b ||
      bytes[2] !== 3 ||
      bytes[3] !== 4
    ) {
      throw new ImportError("Office source is not a ZIP document.");
    }
    const digest = createHash("sha256")
      .update(entry.path)
      .update(bytes)
      .update(pdf || "")
      .digest("hex");
    const storagePath = `course/${digest}/original.${extension}`;
    prepared.push({
      bytes,
      pdf,
      row: {
        course_key: entry.path,
        class_id: null,
        section_id: null,
        owner_id: null,
        title: entry.title.slice(0, 150),
        filename: path.basename(entry.path),
        extension,
        storage_path: storagePath,
        preview_path:
          extension === "pdf"
            ? storagePath
            : pdf
              ? `course/${digest}/preview.pdf`
              : null,
        size_bytes: bytes.length,
        preview_size_bytes:
          extension === "pdf" ? bytes.length : (pdf?.length ?? null),
        audience: entry.audience,
        status: "ready",
      },
    });
  }
  console.log(
    `Validated ${prepared.length} materials and ${prepared.filter((item) => item.pdf).length} PDF previews.`,
  );
  if (mode !== "--upload") {
    console.log(
      "Dry run: no remote writes. Apply the SQL migration, then run with --upload.",
    );
    return;
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    throw new ImportError("Server Supabase variables are required.");
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: schemaError } = await client
    .from("learning_materials")
    .select("id")
    .limit(1);
  if (schemaError)
    throw new ImportError("Apply 202610140001_material_storage.sql first.");
  const { data: settings, error: bucketError } =
    await client.storage.getBucket(bucket);
  if (bucketError || !settings || settings.public)
    throw new ImportError("A private easycode-materials bucket is required.");
  for (const item of prepared) {
    const upload = async (key, bytes, contentType) => {
      const { error } = await client.storage
        .from(bucket)
        .upload(key, bytes, { contentType, upsert: false });
      if (error) {
        // Content-addressed immutable objects can be reused on a retry, but only
        // after verifying the bytes; never overwrite unrelated existing files.
        const existing = await client.storage.from(bucket).download(key);
        if (
          existing.error ||
          !existing.data ||
          !Buffer.from(await existing.data.arrayBuffer()).equals(bytes)
        )
          throw new ImportError(
            "Storage upload failed; check bucket settings and retry.",
          );
      }
    };
    await upload(item.row.storage_path, item.bytes, mime[item.row.extension]);
    if (item.pdf) await upload(item.row.preview_path, item.pdf, mime.pdf);
    const { error } = await client
      .from("learning_materials")
      .upsert(item.row, { onConflict: "course_key" });
    if (error)
      throw new ImportError(
        "Could not save material metadata. Uploaded objects are retained for retry.",
      );
    console.log(`Saved: ${item.row.course_key}`);
  }
  console.log(
    "Course materials uploaded. Original local files were not changed or removed.",
  );
}
main().catch((error) => {
  // SDK errors/credentials are not printed. Only our fixed diagnostic messages.
  console.error(
    error instanceof ImportError
      ? error.message
      : "Import failed. Check local source files, server variables and Storage connectivity.",
  );
  process.exitCode = 1;
});
