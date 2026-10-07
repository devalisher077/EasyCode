// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { PresentationViewer } from "./PresentationViewer";

const mocks = vi.hoisted(() => ({ load: vi.fn(), getDocument: vi.fn() }));
vi.mock("../lib/api", () => ({ loadMaterialPreview: mocks.load }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: mocks.getDocument,
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/assets/test-worker.mjs",
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fakePdf() {
  const cancel = vi.fn();
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel }));
  const getTextContent = vi.fn(async () => ({
    items: [
      { str: "Команды и последовательность", hasEOL: true },
      { str: "Двигаться вперёд", hasEOL: false },
    ],
  }));
  const getPage = vi.fn(async (_page: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 960 * scale,
      height: 540 * scale,
    }),
    render,
    getTextContent,
  }));
  const pdf = { numPages: 3, getPage };
  const destroy = vi.fn(async () => undefined);
  return {
    pdf,
    getPage,
    render,
    cancel,
    destroy,
    getTextContent,
    task: { promise: Promise.resolve(pdf), destroy },
  };
}
type Props = Parameters<typeof PresentationViewer>[0];
let root: Root;
let container: HTMLDivElement;
let close: Mock<() => void>;
let download: Mock<() => void>;
let documentMock: ReturnType<typeof fakePdf>;
let stageHeight: number;
let resize: (() => void) | undefined;
const base: Omit<Props, "onClose" | "onDownload"> = {
  material: {
    type: "presentation",
    audience: "student",
    path: "1.1/Что такое алгоритм.pptx",
  },
  ownerId: "student-1",
  demo: false,
};
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const button = (label: string) =>
  dialog().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
async function mount(props: Partial<Props> = {}) {
  await act(async () =>
    root.render(
      <PresentationViewer
        {...base}
        onClose={close}
        onDownload={download}
        {...props}
      />,
    ),
  );
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function keyboard(key: string) {
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    ),
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.load.mockReset();
  mocks.getDocument.mockReset();
  mocks.load.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  documentMock = fakePdf();
  mocks.getDocument.mockReturnValue(documentMock.task);
  close = vi.fn();
  download = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  stageHeight = 400;
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    () => stageHeight,
  );
  resize = undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network disabled in viewer unit tests");
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PresentationViewer", () => {
  it("loads a protected PDF for the current owner and exposes readable slide text", async () => {
    await mount();
    expect(mocks.load).toHaveBeenCalledWith(base.material.path, {
      expectedUserId: "student-1",
      signal: expect.any(AbortSignal),
    });
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(dialog().textContent).toContain("Что такое алгоритм");
    expect(dialog().textContent).toContain("Слайд 1 из 3");
    expect(dialog().querySelector("details")!.textContent).toContain(
      "Двигаться вперёд",
    );
    expect(documentMock.render).toHaveBeenCalled();
    expect(button("Предыдущий слайд").disabled).toBe(true);
    expect(button("Следующий слайд").disabled).toBe(false);
    expect(document.activeElement).toBe(button("Закрыть презентацию"));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("navigates bounded slides with buttons and arrow keys", async () => {
    await mount();
    await click("Следующий слайд");
    expect(dialog().textContent).toContain("Слайд 2 из 3");
    await keyboard("ArrowRight");
    await keyboard("ArrowRight");
    expect(dialog().textContent).toContain("Слайд 3 из 3");
    expect(button("Следующий слайд").disabled).toBe(true);
    await keyboard("ArrowLeft");
    await click("Предыдущий слайд");
    await keyboard("ArrowLeft");
    expect(dialog().textContent).toContain("Слайд 1 из 3");
    await keyboard("Escape");
    expect(close).toHaveBeenCalledOnce();
  });

  it("changes zoom and returns to fit the whole slide", async () => {
    await mount();
    expect(button("Вписать слайд").disabled).toBe(true);
    const first = dialog().querySelector("canvas")!;
    await click("Увеличить масштаб");
    expect(
      dialog().querySelector(".presentation-zoom-label")!.textContent,
    ).toBe("125%");
    expect(dialog().querySelector("canvas")).not.toBe(first);
    expect(documentMock.cancel).toHaveBeenCalled();
    await click("Вписать слайд");
    expect(
      dialog().querySelector(".presentation-zoom-label")!.textContent,
    ).toBe("100%");
  });

  it("fits both viewport dimensions and recomputes when the available height changes", async () => {
    await mount();
    const canvas = () => dialog().querySelector("canvas")!;
    expect(parseFloat(canvas().style.width)).toBeLessThanOrEqual(768);
    expect(parseFloat(canvas().style.height)).toBeLessThanOrEqual(368);
    expect(parseFloat(canvas().style.height)).toBeGreaterThan(300);
    stageHeight = 200;
    await act(async () => resize?.());
    expect(parseFloat(canvas().style.height)).toBeLessThanOrEqual(168);
    expect(parseFloat(canvas().style.height)).toBeGreaterThan(100);
    await click("Увеличить масштаб");
    expect(parseFloat(canvas().style.height)).toBeGreaterThan(168);
    await click("Вписать слайд");
    expect(parseFloat(canvas().style.height)).toBeLessThanOrEqual(168);
    stageHeight = 80;
    await act(async () => resize?.());
    expect(parseFloat(canvas().style.height)).toBeLessThanOrEqual(48);
  });

  it("resets a zoomed slide's scroll position when changing pages", async () => {
    await mount();
    const stage = dialog().querySelector<HTMLElement>(".presentation-stage")!;
    stage.scrollTop = 120;
    stage.scrollLeft = 80;
    await click("Следующий слайд");
    expect(stage.scrollTop).toBe(0);
    expect(stage.scrollLeft).toBe(0);
  });

  it("shows an actionable missing PDF error and retries without downloading", async () => {
    mocks.load.mockRejectedValueOnce(
      new Error("Файл для просмотра ещё не подготовлен."),
    );
    await mount();
    expect(dialog().querySelector('[role="alert"]')!.textContent).toContain(
      "ещё не подготовлен",
    );
    expect(mocks.getDocument).not.toHaveBeenCalled();
    const retry = [...dialog().querySelectorAll("button")].find(
      (node) => node.textContent === " Повторить",
    )!;
    await act(async () => retry.click());
    expect(dialog().textContent).toContain("Слайд 1 из 3");
    expect(download).not.toHaveBeenCalled();
    const original = [...dialog().querySelectorAll("button")].find((node) =>
      node.textContent?.includes("Скачать оригинал"),
    )!;
    await act(async () => original.click());
    expect(download).toHaveBeenCalledOnce();
  });

  it("aborts the prior fetch and ignores a stale presentation after identity changes", async () => {
    const pending = deferred<Uint8Array>();
    mocks.load.mockReturnValueOnce(pending.promise);
    await mount();
    const firstSignal = mocks.load.mock.calls[0][1].signal as AbortSignal;
    await mount({ ownerId: "student-2" });
    expect(firstSignal.aborted).toBe(true);
    expect(mocks.getDocument).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(new Uint8Array([37, 80, 68, 70])));
    expect(mocks.getDocument).toHaveBeenCalledOnce();
    expect(mocks.load.mock.calls[1][1].expectedUserId).toBe("student-2");
  });

  it("destroys the worker loading task and cancels rendering when closed", async () => {
    const pendingRender = deferred<void>();
    documentMock.render.mockReturnValue({
      promise: pendingRender.promise,
      cancel: documentMock.cancel,
    });
    await mount();
    const signal = mocks.load.mock.calls[0][1].signal as AbortSignal;
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    expect(documentMock.destroy).toHaveBeenCalledOnce();
    expect(documentMock.cancel).toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("");
    await act(async () =>
      pendingRender.reject(new Error("Rendering cancelled")),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("destroys a loading PDF before it resolves and ignores its late result", async () => {
    const pendingDocument = deferred<typeof documentMock.pdf>();
    mocks.getDocument.mockReturnValueOnce({
      promise: pendingDocument.promise,
      destroy: documentMock.destroy,
    });
    await mount();
    expect(dialog().textContent).toContain("Загрузка презентации");
    await act(async () => root.render(null));
    expect(documentMock.destroy).toHaveBeenCalledOnce();
    await act(async () => pendingDocument.resolve(documentMock.pdf));
    expect(documentMock.getPage).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps keyboard focus inside and restores the opener when the viewer closes", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    await mount();
    const first = button("Закрыть презентацию");
    const last = [...dialog().querySelectorAll("button")].at(-1)!;
    expect(document.activeElement).toBe(first);
    last.focus();
    await keyboard("Tab");
    expect(document.activeElement).toBe(first);
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(last);
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("ignores a page that arrives after another page has been selected", async () => {
    const originalGetPage = documentMock.getPage.getMockImplementation()!;
    const pendingPage = deferred<Awaited<ReturnType<typeof originalGetPage>>>();
    documentMock.getPage.mockReturnValueOnce(pendingPage.promise);
    await mount();
    await click("Следующий слайд");
    expect(documentMock.render).toHaveBeenCalledOnce();
    await act(async () => pendingPage.resolve(await originalGetPage(1)));
    expect(documentMock.render).toHaveBeenCalledOnce();
    expect(dialog().textContent).toContain("Слайд 2 из 3");
  });

  it("falls back to an expanded layout when the browser has no Fullscreen API", async () => {
    await mount({ demo: true });
    expect(mocks.load.mock.calls[0][1].expectedUserId).toBeUndefined();
    await click("На весь экран");
    expect(dialog().classList.contains("is-expanded")).toBe(true);
    await click("Выйти из полноэкранного режима");
    expect(dialog().classList.contains("is-expanded")).toBe(false);
  });

  it("uses actual browser fullscreen where available", async () => {
    await mount();
    const requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: dialog(),
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(dialog(), "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    await click("На весь экран");
    expect(requestFullscreen).toHaveBeenCalledOnce();
    await click("Выйти из полноэкранного режима");
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });
});
