// Static browser rendering for the supplied EasyCode OOXML decks. Originals are read-only.
// Handles their explicit-position text, basic shapes, connectors and embedded images.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
const root = path.resolve("content/drone-materials");
const qa = process.argv[2];
if (!qa || !path.isAbsolute(qa))
  throw new Error("Pass an absolute private QA directory");
fs.mkdirSync(qa, { recursive: true });
const fonts =
  "/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts";
const fontCss = [
  ["Calibri.ttf", 400],
  ["Calibrib.ttf", 700],
]
  .map(
    ([file, weight]) =>
      `@font-face{font-family:Calibri; font-weight:${weight};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(fonts, file)).toString("base64")})}`,
  )
  .join("");
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  for (const s of [1, 2, 3])
    for (const n of [1, 2]) {
      const folder = path.join(root, `section-0${s}/topic-0${n}`),
        source = path.join(folder, "Презентация.pptx");
      const list = execFileSync("unzip", ["-Z1", source], { encoding: "utf8" })
        .trim()
        .split("\n");
      const entries = Object.fromEntries(
        list
          .filter((f) => f.startsWith("ppt/") && /\.(xml|rels)$/.test(f))
          .map((f) => [
            f,
            execFileSync("unzip", ["-p", source, f], {
              encoding: "utf8",
              maxBuffer: 10000000,
            }),
          ]),
      );
      const media = Object.fromEntries(
        list
          .filter((f) => /^ppt\/media\//.test(f))
          .map((f) => [
            f,
            `data:image/${f.endsWith(".jpg") ? "jpeg" : f.split(".").at(-1)};base64,${execFileSync("unzip", ["-p", source, f], { maxBuffer: 10000000 }).toString("base64")}`,
          ]),
      );
      const page = await browser.newPage();
      await page.setContent(
        `<html><head><style>${fontCss}*{box-sizing:border-box}body{margin:0}section{position:relative;overflow:hidden;break-after:page}section:last-child{break-after:auto}.shape{position:absolute}.text{position:absolute;display:flex;flex-direction:column;white-space:pre-wrap}p{margin:0;line-height:1.08}span{white-space:pre-wrap}</style></head><body></body></html>`,
      );
      const result = await page.evaluate(
        ({ entries, media }) => {
          const parse = (x) =>
            new DOMParser().parseFromString(x, "application/xml");
          const all = (e, name) => [...e.getElementsByTagNameNS("*", name)];
          const one = (e, name) => all(e, name)[0];
          const child = (e, name) =>
            e && [...e.children].find((x) => x.localName === name);
          const val = (e, key, fallback = 0) =>
            Number(e?.getAttribute(key) ?? fallback);
          const esc = (s) =>
            (s || "").replace(
              /[&<>"']/g,
              (c) =>
                ({
                  "&": "&amp;",
                  "<": "&lt;",
                  ">": "&gt;",
                  '"': "&quot;",
                  "'": "&#39;",
                })[c],
            );
          const presentation = parse(entries["ppt/presentation.xml"]),
            size = one(presentation, "sldSz");
          const w = val(size, "cx") / 9525,
            h = val(size, "cy") / 9525;
          const theme = parse(entries["ppt/theme/theme1.xml"]),
            scheme = one(theme, "clrScheme");
          const colors = Object.fromEntries(
            [...scheme.children].map((x) => [
              x.localName,
              "#" +
                (x.firstElementChild.getAttribute("val") ||
                  x.firstElementChild.getAttribute("lastClr")),
            ]),
          );
          Object.assign(colors, {
            bg1: colors.lt1,
            bg2: colors.lt2,
            tx1: colors.dk1,
            tx2: colors.dk2,
          });
          const color = (e, fallback = "transparent") => {
            if (!e) return fallback;
            const c = [...e.children].find((x) =>
              ["srgbClr", "schemeClr"].includes(x.localName),
            );
            return c
              ? c.localName === "srgbClr"
                ? "#" + c.getAttribute("val")
                : colors[c.getAttribute("val")] || fallback
              : fallback;
          };
          const slides = Object.keys(entries)
            .filter((f) => /^ppt\/slides\/slide\d+.xml$/.test(f))
            .sort(
              (a, b) =>
                Number(a.match(/slide(\d+)/)[1]) -
                Number(b.match(/slide(\d+)/)[1]),
            );
          const warnings = [];
          for (const [i, file] of slides.entries()) {
            const doc = parse(entries[file]),
              rel = parse(entries[`ppt/slides/_rels/slide${i + 1}.xml.rels`]);
            const links = Object.fromEntries(
              all(rel, "Relationship").map((x) => [
                x.getAttribute("Id"),
                x.getAttribute("Target"),
              ]),
            );
            const master = parse(entries["ppt/slideMasters/slideMaster1.xml"]);
            const layoutLink = all(rel, "Relationship")
              .find((x) => x.getAttribute("Type").endsWith("/slideLayout"))
              ?.getAttribute("Target");
            const layout = parse(
              entries[
                layoutLink?.startsWith("/")
                  ? layoutLink.slice(1)
                  : "ppt/" + layoutLink?.replace(/^\.\.\//, "")
              ] || "<empty/>",
            );
            const bg =
              one(doc, "bgPr") || one(layout, "bgPr") || one(master, "bgPr");
            const section = document.createElement("section");
            section.style.cssText = `width:${w}px;height:${h}px;background:${color(bg && child(bg, "solidFill"), colors.lt2)}`;
            document.body.append(section);
            const nodes = [];
            function collect(parent, sx = 1, sy = 1, tx = 0, ty = 0) {
              for (const node of parent.children) {
                if (node.localName === "grpSp") {
                  const gx = one(child(node, "grpSpPr"), "xfrm"),
                    off = one(gx, "off"),
                    ext = one(gx, "ext"),
                    co = one(gx, "chOff"),
                    ce = one(gx, "chExt");
                  const ax =
                      val(ext, "cx") / (val(ce, "cx") || val(ext, "cx") || 1),
                    ay =
                      val(ext, "cy") / (val(ce, "cy") || val(ext, "cy") || 1);
                  collect(
                    node,
                    sx * ax,
                    sy * ay,
                    tx + sx * (val(off, "x") - ax * val(co, "x")),
                    ty + sy * (val(off, "y") - ay * val(co, "y")),
                  );
                } else if (["sp", "pic", "cxnSp"].includes(node.localName)) {
                  const copy = node.cloneNode(true),
                    xf = one(child(copy, "spPr"), "xfrm");
                  if (xf) {
                    const off = one(xf, "off"),
                      ext = one(xf, "ext");
                    off.setAttribute("x", tx + sx * val(off, "x"));
                    off.setAttribute("y", ty + sy * val(off, "y"));
                    ext.setAttribute("cx", sx * val(ext, "cx"));
                    ext.setAttribute("cy", sy * val(ext, "cy"));
                  }
                  nodes.push(copy);
                }
              }
            }
            collect(one(doc, "spTree"));
            for (const node of nodes) {
              const props = child(node, "spPr"),
                xf = props && one(props, "xfrm");
              if (!xf) continue;
              const off = one(xf, "off"),
                ext = one(xf, "ext"),
                x = val(off, "x") / 9525,
                y = val(off, "y") / 9525,
                cx = val(ext, "cx") / 9525,
                cy = val(ext, "cy") / 9525;
              const shape = document.createElement("div");
              shape.className = "shape";
              shape.style.cssText = `left:${x}px;top:${y}px;width:${cx}px;height:${cy}px;transform:rotate(${val(xf, "rot") / 60000}deg)`;
              const geom =
                one(props, "prstGeom")?.getAttribute("prst") || "rect";
              const ln = child(props, "ln");
              const stroke = color(ln && child(ln, "solidFill"));
              const fill = color(child(props, "solidFill"));
              if (node.localName === "pic") {
                const link =
                  links[
                    one(node, "blip")?.getAttributeNS(
                      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                      "embed",
                    )
                  ];
                const img = document.createElement("img");
                img.src =
                  media[
                    link?.startsWith("/")
                      ? link.slice(1)
                      : "ppt/" + link?.replace(/^\.\.\//, "")
                  ];
                img.style.cssText = "width:100%;height:100%;object-fit:fill";
                shape.append(img);
              } else if (node.localName === "cxnSp" || geom === "line") {
                const end = one(ln || props, "tailEnd"),
                  head = one(ln || props, "headEnd");
                const flip = xf.getAttribute("flipV") === "1";
                shape.innerHTML = `<svg width="${Math.max(cx, 1)}" height="${Math.max(cy, 1)}" style="overflow:visible"><defs><marker id="arrow${i}-${node.getAttribute("id") || nodes.indexOf(node)}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0L6 3L0 6Z" fill="${stroke}"/></marker></defs><line x1="0" y1="${flip ? cy : 0}" x2="${cx}" y2="${flip ? 0 : cy}" stroke="${stroke}" stroke-width="${val(ln, "w", 12700) / 9525}" ${end && end.getAttribute("type") !== "none" ? `marker-end="url(#arrow${i}-${nodes.indexOf(node)})"` : ""} ${head && head.getAttribute("type") !== "none" ? `marker-start="url(#arrow${i}-${nodes.indexOf(node)})"` : ""}/></svg>`;
              } else {
                shape.style.background = fill;
                if (stroke !== "transparent")
                  shape.style.border = `${val(ln, "w", 6350) / 9525}px solid ${stroke}`;
                if (geom === "ellipse") shape.style.borderRadius = "50%";
                else if (geom === "roundRect")
                  shape.style.borderRadius = `${Math.min(cx, cy) * 0.12}px`;
                else if (geom !== "rect")
                  warnings.push(`${i + 1}: unsupported shape ${geom}`);
              }
              section.append(shape);
              const body = child(node, "txBody");
              if (!body) continue;
              const ph = one(node, "ph");
              const inherited = ph
                ? all(layout, "sp").find(
                    (x) =>
                      one(x, "ph")?.getAttribute("idx") ===
                      ph.getAttribute("idx"),
                  )
                : undefined;
              const defaultRun =
                one(body, "defRPr") || (inherited && one(inherited, "defRPr"));
              const bp = child(body, "bodyPr");
              const text = document.createElement("div");
              text.className = "text";
              text.style.cssText = `left:${x}px;top:${y}px;width:${cx}px;height:${cy}px;padding:${val(bp, "tIns") / 9525}px ${val(bp, "rIns") / 9525}px ${val(bp, "bIns") / 9525}px ${val(bp, "lIns") / 9525}px;justify-content:${bp?.getAttribute("anchor") === "ctr" ? "center" : bp?.getAttribute("anchor") === "b" ? "flex-end" : "flex-start"};font-family:Calibri,sans-serif;color:${colors.tx2};font-size:24px;`;
              for (const para of [...body.children].filter(
                (x) => x.localName === "p",
              )) {
                const p = document.createElement("p"),
                  pp = child(para, "pPr");
                p.style.textAlign =
                  { ctr: "center", r: "right", l: "left" }[
                    pp?.getAttribute("algn")
                  ] || "left";
                for (const run of para.children) {
                  if (run.localName === "br") {
                    p.append(document.createElement("br"));
                    continue;
                  }
                  if (!["r", "fld"].includes(run.localName)) continue;
                  const rp = child(run, "rPr") || child(para, "endParaRPr"),
                    span = document.createElement("span");
                  span.textContent = one(run, "t")?.textContent || "";
                  span.style.cssText = `font-size:${((val(rp, "sz", val(defaultRun, "sz", 1800)) / 100) * 96) / 72}px;font-weight:${(rp?.getAttribute("b") ?? defaultRun?.getAttribute("b")) === "1" ? 700 : 400};font-style:${rp?.getAttribute("i") === "1" ? "italic" : "normal"};color:${color(rp && child(rp, "solidFill"), color(defaultRun && child(defaultRun, "solidFill"), colors.tx2))};`;
                  p.append(span);
                }
                text.append(p);
              }
              section.append(text);
            }
          }
          const style = document.createElement("style");
          style.textContent = `@page{size:${w}px ${h}px;margin:0}`;
          document.head.append(style);
          return { w, h, pages: slides.length, warnings };
        },
        { entries, media },
      );
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() =>
        Promise.all([...document.images].map((i) => i.decode())),
      );
      const overflows = await page
        .locator(".text")
        .evaluateAll((nodes) =>
          nodes
            .filter(
              (n) =>
                n.scrollHeight > n.clientHeight + 4 ||
                n.scrollWidth > n.clientWidth + 4,
            )
            .map((n) => n.textContent),
        );
      if (result.warnings.length || overflows.length)
        console.log("QA", s, n, result.warnings, overflows);
      await page.pdf({
        path: path.join(folder, "Презентация.pdf"),
        preferCSSPageSize: true,
        printBackground: true,
      });
      await page.setViewportSize({
        width: Math.ceil(result.w),
        height: Math.ceil(result.h),
      });
      for (let i = 0; i < result.pages; i++)
        await page
          .locator("section")
          .nth(i)
          .screenshot({ path: path.join(qa, `${s}.${n}-${i + 1}.png`) });
      console.log(`${s}.${n}: ${result.pages} pages`);
      await page.close();
    }
} finally {
  await browser.close();
}
