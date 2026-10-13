// Offline authoring only. Dependencies are installed separately from the app.
// node scripts/build-course-presentations.mjs --tools-dir <folder> --output-dir <new folder>
import path from "node:path";
import { createRequire } from "node:module";
import { mkdir, access, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { parseArgs } from "node:util";
import { lessons } from "../content/lessons/index.ts";
import { decks } from "../content/presentations/sections-03-06.mjs";

const { values } = parseArgs({ options: {
  "tools-dir": { type: "string" }, "output-dir": { type: "string" },
  "font-dir": { type: "string", default: "/System/Library/Fonts/Supplemental" },
} });
if (!values["tools-dir"] || !values["output-dir"])
  throw new Error("Required: --tools-dir <authoring dependencies> --output-dir <new folder>");
const requireTools = createRequire(path.resolve(values["tools-dir"], "package.json"));
const PptxGenJS = requireTools("pptxgenjs");
const PDFDocument = requireTools("pdfkit");
const JSZip = requireTools("jszip");
const output = path.resolve(values["output-dir"]);
const fonts = {
  Arial: path.join(values["font-dir"], "Arial.ttf"),
  "Arial Bold": path.join(values["font-dir"], "Arial Bold.ttf"),
  "Courier New": path.join(values["font-dir"], "Courier New.ttf"),
};
await Promise.all(Object.values(fonts).map(file => access(file)));
const W = 960, H = 540, margin = 54, width = W - margin * 2;
const colors = { ink: "241D35", muted: "625B72", purple: "6743C6", dark: "1C122F", white: "FFFFFF", pale: "DBCBFF" };
const targets = decks.map(deck => {
  const [section, topic] = deck.id.split(".");
  const folder = path.join(output, `section-${section.padStart(2, "0")}`, `topic-${topic.padStart(2, "0")}`);
  return { deck, folder, base: path.join(folder, "Презентация") };
});
// Check the entire batch before writing anything. Existing files are never overwritten.
for (const { base } of targets) for (const ext of ["pptx", "pdf"]) {
  try { await access(`${base}.${ext}`); }
  catch (error) { if (error.code === "ENOENT") continue; throw error; }
  throw new Error(`Output exists: ${base}.${ext}. Choose a new output directory.`);
}

for (const { deck, folder, base } of targets) {
  const lesson = lessons.find(item => item.id === deck.id);
  if (!lesson) throw new Error(`Missing lesson ${deck.id}`);
  await mkdir(folder, { recursive: true });
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "EASYCODE", width: W / 72, height: H / 72 });
  pptx.layout = "EASYCODE";
  pptx.author = "EasyCode";
  pptx.subject = `Учебные материалы, тема ${deck.id}`;
  pptx.title = lesson.title;
  pptx.lang = "ru-RU";
  pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial", lang: "ru-RU" };
  const pdf = new PDFDocument({ autoFirstPage: false, size: [W, H], margin: 0,
    info: { Title: lesson.title, Author: "EasyCode", Subject: `Тема ${deck.id}` } });
  for (const [font, file] of Object.entries(fonts)) pdf.registerFont(font, file);
  const stream = createWriteStream(`${base}.pdf`, { flags: "wx" });
  const done = finished(stream);
  pdf.pipe(stream);
  let page = 0;

  function text(slide, value, x, y, maxWidth, size, color, { bold = false, mono = false, lineHeight = size * 1.28 } = {}) {
    const font = mono ? "Courier New" : bold ? "Arial Bold" : "Arial";
    pdf.font(font).fontSize(size);
    const lines = [];
    for (const paragraph of value.split("\n")) {
      if (mono) {
        if (pdf.widthOfString(paragraph) > maxWidth) throw new Error(`Code overflow ${deck.id}: ${paragraph}`);
        lines.push(paragraph);
        continue;
      }
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (pdf.widthOfString(candidate) > maxWidth && line) { lines.push(line); line = word; }
        else line = candidate;
      }
      lines.push(line);
    }
    if (y + lines.length * lineHeight > H - 16) throw new Error(`Text overflow ${deck.id}, page ${page}: ${value}`);
    for (const [index, line] of lines.entries()) {
      const top = y + index * lineHeight;
      slide.addText(line, { x: x / 72, y: top / 72, w: maxWidth / 72, h: lineHeight / 72,
        fontFace: mono ? "Courier New" : "Arial", fontSize: size, bold,
        color, margin: 0, breakLine: false, valign: "top", lang: "ru-RU", charSpacing: 0,
        paraSpaceAfterPt: 0, transparency: 0 });
      pdf.fillColor(`#${color}`).text(line, x, top, { lineBreak: false });
    }
    return y + lines.length * lineHeight;
  }
  function addPage(dark = false) {
    page++;
    const slide = pptx.addSlide();
    slide.background = { color: dark ? colors.dark : colors.white };
    pdf.addPage();
    if (dark) pdf.rect(0, 0, W, H).fill(`#${colors.dark}`);
    text(slide, `EasyCode   Тема ${deck.id}`, margin, 503, 650, 12, dark ? colors.pale : colors.muted);
    text(slide, `${page} / 7`, 856, 503, 50, 12, dark ? colors.pale : colors.muted);
    slide.addNotes(`Источник: авторский веб-урок ${deck.id} «${lesson.title}», content/lessons/index.ts. Примеры используют учебный язык EasyCode. Практика: ${lesson.practice.availableInSimulator ? "симулятор машины" : "модель на бумаге"}.`);
    return slide;
  }
  function bodyPage(title, lines, code) {
    const slide = addPage();
    const titleEnd = text(slide, title, margin, 58, width, 32, colors.ink, { bold: true });
    let y = Math.max(153, titleEnd + 30);
    if (code) y = text(slide, code, margin, y, width, 21, colors.purple, { mono: true, lineHeight: 28 }) + 23;
    for (const line of lines) y = text(slide, line, margin, y, width, 22, colors.ink) + 16;
    if (y - 16 > 476) throw new Error(`Body overlaps footer in ${deck.id}, page ${page}: ${y}`);
  }

  const cover = addPage(true);
  text(cover, `Раздел ${lesson.sectionNumber}. ${lesson.sectionTitle}`, margin, 66, width, 18, colors.pale);
  const coverEnd = text(cover, lesson.title, margin, 155, width, 42, colors.white, { bold: true });
  text(cover, deck.subtitle, margin, Math.max(345, coverEnd + 34), width, 24, colors.pale);
  for (const slide of deck.slides) bodyPage(slide.title, slide.lines, slide.code);
  bodyPage(`Практика: ${lesson.practice.availableInSimulator ? "на поле машины" : "на бумаге"}`,
    lesson.practice.instructions.map((line, index) => `${index + 1}. ${line}`));
  bodyPage("Вопросы для самопроверки", [...deck.questions.map((q, i) => `${i + 1}. ${q}`), deck.takeaway]);
  if (page !== 7) throw new Error(`Unexpected page count: ${page}`);
  pdf.end();
  await done;
  const zip = await JSZip.loadAsync(await pptx.write({ outputType: "nodebuffer", compression: true }));
  // PptxGenJS 4.0.1 declares unused slideMaster2..N content types when notes
  // are present. Keep the actual master and remove only these dangling entries.
  const manifest = await zip.file("[Content_Types].xml").async("string");
  zip.file("[Content_Types].xml", manifest.replace(/<Override\b[^>]*PartName="\/([^\"]+)"[^>]*\/>/g, (entry, part) => {
    if (zip.file(part)) return entry;
    if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(part)) return "";
    throw new Error(`Missing package part: ${part}`);
  }));
  await writeFile(`${base}.pptx`, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), { flag: "wx" });
  console.log(`${deck.id}: ${page} slides, PPTX + PDF`);
}
