// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LandingAtmosphere } from "./LandingAtmosphere";

type Point = { x: number; y: number };
let intersections: IntersectionMock[];
let resizes: ResizeMock[];
class IntersectionMock {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback) {
    intersections.push(this);
  }
  notify(target: Element, isIntersecting: boolean) {
    this.callback(
      [{ target, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
class ResizeMock {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: ResizeObserverCallback) {
    resizes.push(this);
  }
  notify() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function contextMock() {
  let path: Point[] = [];
  const strokes: Point[][] = [];
  const gradient = () => ({ addColorStop: vi.fn() });
  return {
    strokes,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    createRadialGradient: vi.fn(gradient),
    createLinearGradient: vi.fn(gradient),
    fillRect: vi.fn(),
    strokeRect: vi.fn(
      (_x: number, _y: number, _width: number, _height: number) => {},
    ),
    rect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    beginPath: vi.fn(() => {
      path = [];
    }),
    moveTo: vi.fn((x: number, y: number) => {
      path.push({ x, y });
    }),
    lineTo: vi.fn((x: number, y: number) => {
      path.push({ x, y });
    }),
    stroke: vi.fn(() => {
      strokes.push([...path]);
    }),
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
  };
}

let root: Root;
let container: HTMLDivElement;
let ctx: ReturnType<typeof contextMock>;
let getContext: ReturnType<typeof vi.spyOn>;
let hidden: boolean;
let rectangle: DOMRect;
let pixelRatio: number;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
const canvas = () => container.querySelector("canvas")!;
async function render(active: boolean) {
  await act(async () => {
    root.render(<LandingAtmosphere active={active} />);
  });
}
function frame(timestamp: number) {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(timestamp));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  intersections = [];
  resizes = [];
  hidden = false;
  rectangle = new DOMRect(0, 0, 1000, 800);
  pixelRatio = 1;
  frames = new Map();
  frameId = 1;
  ctx = contextMock();
  getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(() => rectangle);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(window, "devicePixelRatio", "get").mockImplementation(
    () => pixelRatio,
  );
  vi.stubGlobal("ResizeObserver", ResizeMock);
  vi.stubGlobal("IntersectionObserver", IntersectionMock);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = frameId++;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Network disabled in unit tests"))),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LandingAtmosphere", () => {
  it("renders a static decorative canvas while paused without scheduling animation", async () => {
    await render(false);
    expect(canvas().getAttribute("aria-hidden")).toBe("true");
    expect(canvas().style.pointerEvents).toBe("none");
    expect(ctx.clearRect).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("caps animated paints at 30 FPS even when RAF fires at 120 Hz", async () => {
    await render(true);
    ctx.clearRect.mockClear();
    for (let timestamp = 1; timestamp <= 1001; timestamp += 1000 / 120)
      frame(timestamp);
    expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(20);
    expect(ctx.clearRect.mock.calls.length).toBeLessThanOrEqual(30);
    expect(frames.size).toBe(1);
  });

  it("stops offscreen and keeps hidden documents stopped until both conditions allow animation", async () => {
    await render(true);
    intersections[0].notify(canvas(), false);
    expect(frames.size).toBe(0);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    intersections[0].notify(canvas(), true);
    expect(frames.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(1);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0);
  });

  it("does not schedule animation when initially hidden or outside the viewport", async () => {
    hidden = true;
    await render(true);
    expect(frames.size).toBe(0);
    hidden = false;
    intersections[0].notify(canvas(), false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0);
  });

  it("resizes its backing buffer and caps device pixel ratio at 1.5", async () => {
    pixelRatio = 3;
    await render(false);
    expect(canvas().width).toBe(1500);
    expect(canvas().height).toBe(1200);
    expect(ctx.setTransform).toHaveBeenLastCalledWith(1.5, 0, 0, 1.5, 0, 0);
    rectangle = new DOMRect(0, 0, 600, 700);
    resizes[0].notify();
    expect(canvas().width).toBe(900);
    expect(canvas().height).toBe(1050);
    const paints = ctx.clearRect.mock.calls.length;
    resizes[0].notify();
    expect(ctx.clearRect).toHaveBeenCalledTimes(paints);
    pixelRatio = 1;
    resizes[0].notify();
    expect(canvas().width).toBe(600);
    expect(canvas().height).toBe(700);
  });

  it("supports resize and offscreen-stop fallbacks without observer APIs", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    vi.stubGlobal("IntersectionObserver", undefined);
    await render(true);
    expect(frames.size).toBe(1);
    rectangle = new DOMRect(0, -900, 1000, 800);
    window.dispatchEvent(new Event("scroll"));
    expect(frames.size).toBe(0);
    rectangle = new DOMRect(0, 0, 500, 600);
    window.dispatchEvent(new Event("resize"));
    expect(canvas().width).toBe(500);
    expect(canvas().height).toBe(600);
    expect(frames.size).toBe(1);
  });

  it("cancels the running frame and disconnects old observers when paused", async () => {
    await render(true);
    const oldIntersection = intersections[0];
    const oldResize = resizes[0];
    await render(false);
    expect(frames.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(oldIntersection.disconnect).toHaveBeenCalledOnce();
    expect(oldResize.disconnect).toHaveBeenCalledOnce();
    await render(true);
    expect(frames.size).toBe(1);
  });

  it("cleans up RAF, observers and global listeners on unmount", async () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    await render(true);
    const staleFrame = [...frames.values()][0];
    await act(async () => {
      root.unmount();
    });
    expect(frames.size).toBe(0);
    expect(intersections[0].disconnect).toHaveBeenCalledOnce();
    expect(resizes[0].disconnect).toHaveBeenCalledOnce();
    expect(removeWindow).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    const paints = ctx.clearRect.mock.calls.length;
    staleFrame(5000);
    expect(ctx.clearRect).toHaveBeenCalledTimes(paints);
    expect(frames.size).toBe(0);
    root = createRoot(container);
  });

  it.each(["unavailable", "throws"])(
    "degrades safely when canvas context %s",
    async (mode) => {
      if (mode === "throws")
        getContext.mockImplementation(() => {
          throw new Error("canvas unavailable");
        });
      else getContext.mockReturnValue(null);
      await render(true);
      expect(canvas()).not.toBeNull();
      expect(frames.size).toBe(0);
      expect(intersections).toHaveLength(0);
      expect(resizes).toHaveLength(0);
    },
  );

  it.each([
    { width: 1000, height: 800 },
    { width: 390, height: 900 },
  ])(
    "covers the full $width × $height hero with square cells and width-spanning wave layers",
    async ({ width, height }) => {
      rectangle = new DOMRect(0, 0, width, height);
      await render(false);
      const squares = ctx.strokeRect.mock.calls.map(
        ([x, y, cellWidth, cellHeight]) => ({
          x: x + cellWidth / 2,
          y: y + cellHeight / 2,
        }),
      );
      expect(squares.length).toBeGreaterThan(0);
      const waves = ctx.strokes.filter((points) => points.length >= 20);
      expect(waves.length).toBeGreaterThan(0);
      for (const points of waves) {
        expect(Math.min(...points.map((point) => point.x))).toBeLessThanOrEqual(
          0,
        );
        expect(
          Math.max(...points.map((point) => point.x)),
        ).toBeGreaterThanOrEqual(width);
        expect(
          points.every(
            (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
          ),
        ).toBe(true);
      }
      for (const band of [0, 1, 2]) {
        const inBand = (point: Point) =>
          point.y >= (height * band) / 3 && point.y < (height * (band + 1)) / 3;
        expect(
          squares.some(
            (point) => inBand(point) && point.x >= 0 && point.x < width / 4,
          ),
        ).toBe(true);
        expect(
          squares.some(
            (point) =>
              inBand(point) && point.x > (width * 3) / 4 && point.x <= width,
          ),
        ).toBe(true);
        expect(
          waves.some((points) =>
            points.some(
              (point) => inBand(point) && point.x >= 0 && point.x <= width,
            ),
          ),
        ).toBe(true);
      }
    },
  );
});
