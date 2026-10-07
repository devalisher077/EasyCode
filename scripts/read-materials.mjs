// Read-only text extraction from supplied OOXML sources. No source files change.
import { execFileSync } from "node:child_process";

const file = process.argv[2];
if (!file || !/\.(pptx|docx)$/.test(file))
  throw new Error("Pass a DOCX or PPTX path.");
const decode = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const entries = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" })
  .split("\n")
  .filter((name) =>
    file.endsWith("pptx")
      ? /^ppt\/slides\/slide\d+\.xml$/.test(name)
      : name === "word/document.xml",
  )
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
for (const entry of entries) {
  console.log(`\n${entry}`);
  const xml = execFileSync("unzip", ["-p", file, entry], { encoding: "utf8" });
  for (const paragraph of xml.match(/<(?:a|w):p\b[\s\S]*?<\/(?:a|w):p>/g) ||
    []) {
    const text = [
      ...paragraph.matchAll(/<(?:a|w):t\b[^>]*>([\s\S]*?)<\/(?:a|w):t>/g),
    ]
      .map((match) => decode(match[1]))
      .join("");
    if (text.trim()) console.log(text);
  }
}
