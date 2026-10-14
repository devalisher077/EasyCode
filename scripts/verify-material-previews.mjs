import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);

export function parseArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]))
    return { help: true };
  if (!args.length) return {};
  if (
    args.length === 2 &&
    args[0] === "--render-dir" &&
    args[1] &&
    !args[1].startsWith("--")
  )
    return { renderDir: path.resolve(args[1]) };
  throw new Error(
    "Использование: node scripts/verify-material-previews.mjs [--render-dir /private/tmp/easycode-preview-qa]",
  );
}

export function presentationEntries(catalog) {
  const seen = new Set();
  const entries = [];
  for (const section of catalog.sections ?? []) {
    for (const topic of section.topics ?? []) {
      for (const material of topic.materials ?? []) {
        if (
          material.type !== "presentation" ||
          !material.path?.endsWith(".pptx")
        )
          continue;
        if (seen.has(material.path)) continue;
        seen.add(material.path);
        entries.push({
          original: material.path,
          topic: String(topic.number),
          title: topic.title,
        });
      }
    }
  }
  return entries;
}

export function countSlides(zipEntries) {
  const count = zipEntries
    .split(/\r?\n/)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
  if (!count) throw new Error("В исходном PPTX не найдены слайды.");
  return count;
}

function inside(root, relative) {
  const target = path.resolve(root, relative);
  if (path.isAbsolute(relative) || !target.startsWith(`${root}${path.sep}`))
    throw new Error("Путь материала выходит за пределы каталога.");
  return target;
}

function extractText(content) {
  return content.items
    .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
    .join("")
    .trim();
}

/** Dependencies are injectable so tests need neither authored PDFs nor external services. */
export async function verifyPresentation(entry, options) {
  const {
    root,
    getDocument,
    renderDir,
    canvas,
    pdfOptions = {},
    imageOps = [],
  } = options;
  const read = options.read ?? readFile;
  const listZip =
    options.listZip ??
    (async (source) =>
      (
        await execFileAsync("unzip", ["-Z1", source], {
          maxBuffer: 8 * 1024 * 1024,
        })
      ).stdout);
  const originalPath = inside(root, entry.original);
  const relativePdf = entry.original.slice(0, -5) + ".pdf";
  const pdfPath = inside(root, relativePdf);
  const expectedSlides = countSlides(await listZip(originalPath));
  const bytes = await read(pdfPath);
  if (bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("Файл не содержит заголовок PDF.");
  const loading = getDocument({
    ...pdfOptions,
    data: Uint8Array.from(bytes),
    enableXfa: false,
    isEvalSupported: false,
    stopAtErrors: true,
  });
  try {
    const pdf = await loading.promise;
    if (!Number.isInteger(pdf.numPages) || pdf.numPages < 1)
      throw new Error("В PDF нет страниц.");
    const errors = [];
    if (pdf.numPages !== expectedSlides)
      errors.push(
        `Число слайдов не совпадает: PPTX ${expectedSlides}, PDF ${pdf.numPages}.`,
      );
    const result = {
      ...entry,
      pdf: relativePdf,
      expectedSlides,
      pages: pdf.numPages,
      pageChecks: [],
      errors,
    };
    const outputName = path
      .dirname(entry.original)
      .replace(/[^a-zA-Z0-9_-]/g, "-");
    const outputDir = renderDir ? path.join(renderDir, outputName) : null;
    if (outputDir) await mkdir(outputDir, { recursive: true });
    let sheet;
    let sheetContext;
    const cellWidth = 412,
      cellHeight = 280,
      columns = 4,
      header = 72;
    if (outputDir) {
      if (!canvas) throw new Error("Для рендера требуется @napi-rs/canvas.");
      sheet = canvas.createCanvas(
        columns * cellWidth,
        header + Math.ceil(pdf.numPages / columns) * cellHeight,
      );
      sheetContext = sheet.getContext("2d");
      sheetContext.fillStyle = "#e9eaf0";
      sheetContext.fillRect(0, 0, sheet.width, sheet.height);
      sheetContext.fillStyle = "#181725";
      sheetContext.font = "bold 22px sans-serif";
      sheetContext.fillText(
        `${entry.topic}: ${entry.title}`,
        18,
        31,
        sheet.width - 36,
      );
      sheetContext.font = "15px sans-serif";
      sheetContext.fillText(
        `PPTX: ${expectedSlides} | PDF: ${pdf.numPages} | Inspect every slide; text extraction does not verify layout.`,
        18,
        55,
      );
    }
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const text = extractText(await page.getTextContent());
      const readable =
        text.replace(/\s/g, "").length > 0 && !text.includes("\ufffd");
      // Only hash-verified image-only sources may intentionally have no text.
      // A blank page is still an error, even for that source format.
      const hasImages =
        entry.imageOnly === true &&
        (await page.getOperatorList()).fnArray.some((operation) =>
          imageOps.includes(operation),
        );
      if ((!readable && !hasImages) || text.includes("\ufffd"))
        errors.push(
          `Слайд ${number}: нет читаемого текстового слоя или обнаружен символ замены.`,
        );
      const viewport = page.getViewport({ scale: 1 });
      const check = {
        page: number,
        width: viewport.width,
        height: viewport.height,
        readable,
        hasImages,
        characters: text.length,
        text,
      };
      if (outputDir) {
        const scale = Math.min(
          1440 / viewport.width,
          Math.sqrt(12_000_000 / (viewport.width * viewport.height)),
        );
        const renderViewport = page.getViewport({ scale });
        const pageCanvas = canvas.createCanvas(
          Math.ceil(renderViewport.width),
          Math.ceil(renderViewport.height),
        );
        await page.render({
          canvas: pageCanvas,
          canvasContext: pageCanvas.getContext("2d"),
          viewport: renderViewport,
          background: "rgb(255,255,255)",
        }).promise;
        const filename = `page-${String(number).padStart(2, "0")}.png`;
        await writeFile(
          path.join(outputDir, filename),
          await pageCanvas.encode("png"),
        );
        check.png = path.join(outputName, filename);
        const x = ((number - 1) % columns) * cellWidth + 12;
        const y = header + Math.floor((number - 1) / columns) * cellHeight;
        const thumbnailScale = Math.min(
          (cellWidth - 24) / pageCanvas.width,
          (cellHeight - 42) / pageCanvas.height,
        );
        sheetContext.fillStyle = readable || hasImages ? "#25243a" : "#b30020";
        sheetContext.font = "16px sans-serif";
        sheetContext.fillText(
          `Slide ${number} · ${hasImages && !readable ? "image-only source" : `${text.length} chars`}`,
          x,
          y + 21,
        );
        sheetContext.drawImage(
          pageCanvas,
          x,
          y + 31,
          pageCanvas.width * thumbnailScale,
          pageCanvas.height * thumbnailScale,
        );
        pageCanvas.width = pageCanvas.height = 1;
      }
      result.pageChecks.push(check);
      page.cleanup?.();
    }
    if (outputDir) {
      result.contactSheet = `${outputName}-contact-sheet.png`;
      await writeFile(
        path.join(renderDir, result.contactSheet),
        await sheet.encode("png"),
      );
      sheet.width = sheet.height = 1;
    }
    return result;
  } finally {
    await loading.destroy();
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(
      "Проверка локальных PPTX/PDF из каталога. Файлы источников не изменяются.\nnode scripts/verify-material-previews.mjs [--render-dir /private/tmp/easycode-preview-qa]\nРендер создаёт PNG каждой страницы, контактный лист каждой презентации и report.json. Новые запуски обновляют одноимённые QA-файлы.\nexit 0: проверки пройдены; exit 1: ошибка или недостающий PDF. Визуальный просмотр PNG остаётся обязательным.",
    );
    return 0;
  }
  const root = path.join(repositoryRoot, "content/materials");
  if (
    options.renderDir &&
    (options.renderDir === repositoryRoot ||
      options.renderDir === root ||
      options.renderDir.startsWith(`${root}${path.sep}`))
  )
    throw new Error(
      "QA-вывод должен быть в отдельной папке, не в корне проекта или каталоге исходных материалов.",
    );
  const catalog = JSON.parse(
    await readFile(path.join(root, "catalog.json"), "utf8"),
  );
  const entries = presentationEntries(catalog);
  if (!entries.length) throw new Error("В каталоге нет презентаций PPTX.");
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const sourceManifest = JSON.parse(
    await readFile(path.join(root, "presentation-sources.json"), "utf8").catch(
      (error) => {
        if (error.code === "ENOENT") return '{"presentations":[]}';
        throw error;
      },
    ),
  );
  for (const entry of entries) {
    const source = sourceManifest.presentations.find(
      (item) => item.path === entry.original,
    );
    if (!source) continue;
    const digest = (file) =>
      readFile(inside(root, file)).then((bytes) =>
        createHash("sha256").update(bytes).digest("hex"),
      );
    if (
      (await digest(entry.original)) !== source.sha256 ||
      (await digest(entry.original.slice(0, -5) + ".pdf")) !==
        source.previewSha256
    )
      throw new Error(
        `${entry.topic}: импортированные файлы отличаются от проверенных исходников. Обновите manifest после проверки.`,
      );
    entry.imageOnly = source.format === "image-only";
  }
  const packageRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const canvas = options.renderDir ? await import("@napi-rs/canvas") : null;
  const pdfOptions = {
    useWorkerFetch: false,
    cMapUrl: `${path.join(packageRoot, "cmaps")}${path.sep}`,
    cMapPacked: true,
    standardFontDataUrl: `${path.join(packageRoot, "standard_fonts")}${path.sep}`,
    wasmUrl: `${path.join(packageRoot, "wasm")}${path.sep}`,
  };
  const report = {
    generatedAt: new Date().toISOString(),
    presentations: [],
    failures: [],
    totalPages: 0,
  };
  for (const entry of entries) {
    try {
      const result = await verifyPresentation(entry, {
        root,
        getDocument,
        canvas,
        pdfOptions,
        imageOps: [
          OPS.paintImageXObject,
          OPS.paintInlineImageXObject,
          OPS.paintImageXObjectRepeat,
        ],
        renderDir: options.renderDir,
      });
      report.presentations.push(result);
      report.totalPages += result.pages;
      report.failures.push(
        ...result.errors.map((error) => `${entry.topic}: ${error}`),
      );
      console.log(
        `${result.errors.length ? "FAIL" : "OK"} ${entry.topic}: ${result.pages}/${result.expectedSlides} pages; ${result.pageChecks.filter((page) => page.readable).length}/${result.pages} text layers${result.contactSheet ? `; ${result.contactSheet}` : ""}`,
      );
    } catch (error) {
      const message = `${entry.topic}: ${error instanceof Error ? error.message : String(error)}`;
      report.failures.push(message);
      console.error(`FAIL ${message}`);
    }
  }
  if (options.renderDir) {
    await mkdir(options.renderDir, { recursive: true });
    await writeFile(
      path.join(options.renderDir, "report.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  console.log(
    `Проверено: ${report.presentations.length}/${entries.length} презентаций, ${report.totalPages} страниц. Ошибок: ${report.failures.length}.`,
  );
  if (options.renderDir)
    console.log(
      `QA: ${options.renderDir}\nОткройте все контактные листы и PNG; автоматические проверки не подтверждают отсутствие обрезки или наложений.`,
    );
  return report.failures.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
