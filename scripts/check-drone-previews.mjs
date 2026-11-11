import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import {
  presentationEntries,
  verifyPresentation,
} from "./verify-material-previews.mjs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as canvas from "@napi-rs/canvas";
const require = createRequire(import.meta.url);
const root = path.resolve("content/drone-materials");
const renderDir = process.argv[2];
if (!renderDir || !path.isAbsolute(renderDir) || renderDir.startsWith(root))
  throw new Error("Pass a private absolute QA directory outside materials");
await mkdir(renderDir, { recursive: true });
const packageRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const catalog = JSON.parse(
  await readFile(path.join(root, "catalog.json"), "utf8"),
);
const report = [];
for (const entry of presentationEntries(catalog)) {
  entry.original = entry.original.replace(/^drones\//, "");
  const result = await verifyPresentation(entry, {
    root,
    getDocument,
    canvas,
    renderDir,
    imageOps: [
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageXObjectRepeat,
    ],
    pdfOptions: {
      useWorkerFetch: false,
      cMapUrl: packageRoot + "/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: packageRoot + "/standard_fonts/",
      wasmUrl: packageRoot + "/wasm/",
    },
  });
  report.push(result);
  console.log(entry.topic, result.pages, result.errors);
}
await writeFile(
  path.join(renderDir, "report.json"),
  JSON.stringify(report, null, 2),
);
if (report.some((x) => x.errors.length)) process.exitCode = 1;
