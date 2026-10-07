import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  countSlides,
  parseArgs,
  presentationEntries,
  verifyPresentation,
} from "./verify-material-previews.mjs";

function fixture({
  pages = 2,
  texts = ["Слайд один", "Slide two"],
  zipSlides = 2,
} = {}) {
  const pageCleanup = vi.fn();
  const getPage = vi.fn(async (number) => ({
    getTextContent: async () => ({
      items: [{ str: texts[number - 1] ?? "", hasEOL: true }],
    }),
    getViewport: ({ scale }) => ({ width: 960 * scale, height: 540 * scale }),
    cleanup: pageCleanup,
  }));
  const destroy = vi.fn(async () => undefined);
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({ numPages: pages, getPage }),
    destroy,
  }));
  const read = vi.fn(async () => Buffer.from("%PDF-1.7\nsynthetic mock only"));
  const listZip = vi.fn(async () =>
    Array.from(
      { length: zipSlides },
      (_, i) => `ppt/slides/slide${i + 1}.xml`,
    ).join("\n"),
  );
  const entry = {
    original: "section-01/topic-01/Презентация.pptx",
    topic: "1.1",
    title: "Алгоритмы",
  };
  return {
    entry,
    options: {
      root: "/private/tmp/material-preview-fixture",
      getDocument,
      read,
      listZip,
    },
    getPage,
    destroy,
    pageCleanup,
  };
}

describe("material preview verification", () => {
  it("accepts only explicit render-dir or help CLI options", () => {
    expect(parseArgs([])).toEqual({});
    expect(parseArgs(["--help"])).toEqual({ help: true });
    expect(parseArgs(["--render-dir", "/private/tmp/qa"])).toEqual({
      renderDir: "/private/tmp/qa",
    });
    expect(() => parseArgs(["--render-dir"])).toThrow("Использование");
    expect(() => parseArgs(["--url", "https://example.test/file.pdf"])).toThrow(
      "Использование",
    );
  });

  it("selects exact unique presentation PPTX paths, excluding notes and PDFs", () => {
    const pptx = { type: "presentation", path: "topic/Презентация.pptx" };
    expect(
      presentationEntries({
        sections: [
          {
            topics: [
              {
                number: "1.1",
                title: "Тема",
                materials: [
                  pptx,
                  pptx,
                  { ...pptx, path: "topic/Презентация.pdf" },
                  { type: "teacher_notes", path: "notes.pptx" },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([{ original: pptx.path, topic: "1.1", title: "Тема" }]);
    expect(
      countSlides(
        "ppt/slides/slide1.xml\nppt/slides/slide2.xml\nppt/slides/_rels/slide1.xml.rels\nppt/notesSlides/notesSlide1.xml\n",
      ),
    ).toBe(2);
    expect(() => countSlides("ppt/slides/_rels/slide1.xml.rels")).toThrow(
      "не найдены",
    );
  });

  it("checks every synthetic PDF page, preserving source files and releasing the document", async () => {
    const { entry, options, getPage, destroy, pageCleanup } = fixture();
    const result = await verifyPresentation(entry, options);
    expect(result.pages).toBe(2);
    expect(result.expectedSlides).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.pageChecks.map((page) => page.text)).toEqual([
      "Слайд один",
      "Slide two",
    ]);
    expect(getPage.mock.calls).toEqual([[1], [2]]);
    expect(options.read).toHaveBeenCalledWith(
      "/private/tmp/material-preview-fixture/section-01/topic-01/Презентация.pdf",
    );
    expect(options.getDocument.mock.calls[0][0]).toMatchObject({
      enableXfa: false,
      isEvalSupported: false,
      stopAtErrors: true,
    });
    expect(pageCleanup).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("reports mismatched slide counts and missing or corrupt text without skipping pages", async () => {
    const { entry, options, getPage } = fixture({
      pages: 3,
      zipSlides: 4,
      texts: ["Один", "  ", "\ufffd"],
    });
    const result = await verifyPresentation(entry, options);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]).toContain("PPTX 4, PDF 3");
    expect(result.pageChecks.map((page) => page.readable)).toEqual([
      true,
      false,
      false,
    ]);
    expect(getPage).toHaveBeenCalledTimes(3);
  });

  it("destroys invalid or failing documents and rejects paths outside the catalog root", async () => {
    const fixtureEmpty = fixture({ pages: 0 });
    await expect(
      verifyPresentation(fixtureEmpty.entry, fixtureEmpty.options),
    ).rejects.toThrow("нет страниц");
    expect(fixtureEmpty.destroy).toHaveBeenCalledOnce();
    const fixtureBadPage = fixture();
    fixtureBadPage.getPage.mockRejectedValue(new Error("Page decoding failed"));
    await expect(
      verifyPresentation(fixtureBadPage.entry, fixtureBadPage.options),
    ).rejects.toThrow("Page decoding failed");
    expect(fixtureBadPage.destroy).toHaveBeenCalledOnce();
    await expect(
      verifyPresentation(
        { ...fixtureBadPage.entry, original: "../../file.pptx" },
        fixtureBadPage.options,
      ),
    ).rejects.toThrow("за пределы");
  });

  it("rejects absent PDFs and invalid PDF bytes before document parsing", async () => {
    const { entry, options } = fixture();
    options.read.mockRejectedValueOnce(
      Object.assign(new Error("No prepared PDF"), { code: "ENOENT" }),
    );
    await expect(verifyPresentation(entry, options)).rejects.toThrow(
      "No prepared PDF",
    );
    options.read.mockResolvedValueOnce(Buffer.from("not a PDF"));
    await expect(verifyPresentation(entry, options)).rejects.toThrow(
      "заголовок PDF",
    );
    expect(options.getDocument).not.toHaveBeenCalled();
  });

  it("renders all synthetic pages and one labeled contact sheet using the installed canvas", async () => {
    const canvas = await import("@napi-rs/canvas");
    const renderDir = await mkdtemp(
      path.join(os.tmpdir(), "easycode-preview-render-test-"),
    );
    const { entry, options, getPage, destroy } = fixture();
    const render = vi.fn(({ canvasContext, viewport }) => {
      canvasContext.fillStyle = "#ffffff";
      canvasContext.fillRect(0, 0, viewport.width, viewport.height);
      canvasContext.fillStyle = "#392454";
      canvasContext.font = "36px sans-serif";
      canvasContext.fillText("Synthetic QA slide", 40, 70);
      return { promise: Promise.resolve() };
    });
    const createPage = getPage.getMockImplementation();
    getPage.mockImplementation(async (number) => ({
      ...(await createPage(number)),
      render,
    }));
    try {
      const result = await verifyPresentation(entry, {
        ...options,
        renderDir,
        canvas,
      });
      expect(render).toHaveBeenCalledTimes(2);
      expect(
        result.pageChecks.every((page) => page.png?.endsWith(".png")),
      ).toBe(true);
      for (const file of [
        ...result.pageChecks.map((page) => page.png),
        result.contactSheet,
      ]) {
        const bytes = await readFile(path.join(renderDir, file));
        expect(bytes.subarray(1, 4).toString()).toBe("PNG");
        const image = await canvas.loadImage(bytes);
        expect(image.width).toBeGreaterThan(1000);
        expect(image.height).toBeGreaterThan(200);
      }
      expect(destroy).toHaveBeenCalledOnce();
    } finally {
      // Only this test's freshly-created temporary directory is removed.
      await rm(renderDir, { recursive: true });
    }
  });
});
