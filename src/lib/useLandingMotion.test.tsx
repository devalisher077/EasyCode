// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLandingMotion } from "./useLandingMotion";

const storageKey = "easycode:landing-motion";
const reducedQuery = "(prefers-reduced-motion: reduce)";
const pointerQuery = "(hover: hover) and (pointer: fine)";

class Media extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }
  set(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}
let observers: Observer[];
class Observer {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  notify(target: Element, isIntersecting: boolean) {
    this.callback(
      [{ target, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useLandingMotion>;
let reduced: Media;
let pointer: Media;
let hidden: boolean;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
function Harness({ suspended = false }: { suspended?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  state = useLandingMotion(ref, suspended);
  return (
    <div ref={ref} className={state.enabled ? "lp-motion-on" : "lp-motion-off"}>
      <section data-reveal data-testid="visible">
        Always readable
      </section>
      <section data-reveal data-testid="offscreen">
        <button>Focusable content</button>
      </section>
      <section data-loop data-testid="loop">
        Decorative loop
      </section>
      <article data-spotlight data-testid="spotlight">
        Interactive card
      </article>
    </div>
  );
}
const element = (id: string) =>
  container.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
async function render(suspended = false) {
  await act(async () => {
    root.render(<Harness suspended={suspended} />);
  });
}
function move(target: HTMLElement, type = "mouse", x = 100, y = 50) {
  const event = new Event("pointermove", { bubbles: true });
  Object.assign(event, { pointerType: type, clientX: x, clientY: y });
  target.dispatchEvent(event);
}
function flushFrames() {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(16);
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  hidden = false;
  reduced = new Media(false);
  pointer = new Media(true);
  observers = [];
  frames = new Map();
  nextFrame = 1;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) =>
      query === reducedQuery
        ? reduced
        : query === pointerQuery
          ? pointer
          : new Media(false),
    ),
  );
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrame++;
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const top =
        this.dataset.testid === "offscreen" ? window.innerHeight + 200 : 0;
      return new DOMRect(0, top, 300, 200);
    },
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

describe("useLandingMotion", () => {
  it("starts enabled, keeps visible content readable and reveals offscreen sections on intersection", async () => {
    await render();
    expect(state).toMatchObject({
      enabled: true,
      paused: false,
      reducedMotion: false,
    });
    expect(element("visible").classList.contains("lp-revealed")).toBe(true);
    expect(element("offscreen").classList.contains("lp-reveal-pending")).toBe(
      true,
    );
    expect(observers[0].observe).toHaveBeenCalledTimes(3);
    observers[0].notify(element("offscreen"), true);
    expect(element("offscreen").classList.contains("lp-reveal-pending")).toBe(
      false,
    );
    expect(element("offscreen").classList.contains("lp-revealed")).toBe(true);
    observers[0].notify(element("offscreen"), false);
    expect(element("offscreen").dataset.inView).toBe("false");
    expect(element("offscreen").classList.contains("lp-revealed")).toBe(true);
  });

  it("reveals a section immediately when keyboard focus reaches its content", async () => {
    await render();
    element("offscreen")
      .querySelector("button")!
      .dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(element("offscreen").classList.contains("lp-revealed")).toBe(true);
    expect(element("offscreen").classList.contains("lp-reveal-pending")).toBe(
      false,
    );
  });

  it("persists manual pause/resume and restores it after remount", async () => {
    await render();
    await act(async () => {
      state.toggle();
    });
    expect(state).toMatchObject({ enabled: false, paused: true });
    expect(localStorage.getItem(storageKey)).toBe("off");
    expect(element("offscreen").classList.contains("lp-revealed")).toBe(true);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await render();
    expect(state).toMatchObject({ enabled: false, paused: true });
    await act(async () => {
      state.toggle();
    });
    expect(state).toMatchObject({ enabled: true, paused: false });
    expect(localStorage.getItem(storageKey)).toBe("on");
  });

  it("lets OS reduced-motion override saved and toggled preferences and reacts to OS changes", async () => {
    localStorage.setItem(storageKey, "on");
    reduced.matches = true;
    await render();
    expect(state).toMatchObject({
      enabled: false,
      paused: false,
      reducedMotion: true,
    });
    expect(observers).toHaveLength(0);
    expect(element("offscreen").classList.contains("lp-revealed")).toBe(true);
    await act(async () => {
      state.toggle();
    });
    await act(async () => {
      state.toggle();
    });
    expect(state.enabled).toBe(false);
    await act(async () => {
      reduced.set(false);
    });
    expect(state.enabled).toBe(true);
    await act(async () => {
      reduced.set(true);
    });
    expect(state.enabled).toBe(false);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
  });

  it("suspends for dialogs without overwriting the manual preference", async () => {
    await render();
    await render(true);
    expect(state).toMatchObject({ enabled: false, paused: false });
    expect(localStorage.getItem(storageKey)).toBeNull();
    await render(false);
    expect(state.enabled).toBe(true);
    await act(async () => {
      state.toggle();
    });
    await render(true);
    await render(false);
    expect(state).toMatchObject({ enabled: false, paused: true });
    expect(localStorage.getItem(storageKey)).toBe("off");
  });

  it("stops in a hidden document and resumes only if the user did not pause", async () => {
    await render();
    await act(async () => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.enabled).toBe(false);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    await act(async () => {
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.enabled).toBe(true);
    await act(async () => {
      state.toggle();
    });
    await act(async () => {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.enabled).toBe(false);
  });

  it("keeps all content visible when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await render();
    expect(container.querySelectorAll(".lp-reveal-pending")).toHaveLength(0);
    expect(container.querySelectorAll(".lp-revealed")).toHaveLength(3);
    expect(observers).toHaveLength(0);
  });

  it("keeps manual controls functional if localStorage reads and writes throw", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await render();
    expect(state.enabled).toBe(true);
    await act(async () => {
      state.toggle();
    });
    expect(state).toMatchObject({ enabled: false, paused: true });
    await act(async () => {
      state.toggle();
    });
    expect(state.enabled).toBe(true);
  });

  it("coalesces fine-pointer updates and clears tilt on scroll or pointer-mode change", async () => {
    await render();
    move(element("spotlight"));
    move(element("spotlight"), "mouse", 200, 100);
    expect(frames.size).toBe(1);
    flushFrames();
    expect(element("spotlight").dataset.pointerActive).toBe("true");
    expect(element("spotlight").style.getPropertyValue("--spot-x")).toBe(
      "200px",
    );
    window.dispatchEvent(new Event("scroll"));
    expect(element("spotlight").hasAttribute("data-pointer-active")).toBe(
      false,
    );
    expect(element("spotlight").style.getPropertyValue("--tilt-x")).toBe("");
    move(element("spotlight"));
    expect(frames.size).toBe(1);
    pointer.set(false);
    expect(frames.size).toBe(0);
    move(element("spotlight"));
    expect(frames.size).toBe(0);
  });

  it("does not schedule hover frames for touch or coarse pointers", async () => {
    await render();
    move(element("spotlight"), "touch");
    expect(frames.size).toBe(0);
    await act(async () => {
      root.unmount();
    });
    pointer.matches = false;
    root = createRoot(container);
    await render();
    move(element("spotlight"));
    expect(frames.size).toBe(0);
  });

  it("disconnects observers, cancels pending frames and removes listeners on unmount", async () => {
    const removeReduced = vi.spyOn(reduced, "removeEventListener");
    const removePointer = vi.spyOn(pointer, "removeEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    await render();
    const surface = container.firstElementChild!;
    const removeSurface = vi.spyOn(surface, "removeEventListener");
    const offscreen = element("offscreen");
    move(element("spotlight"));
    expect(frames.size).toBe(1);
    await act(async () => {
      root.unmount();
    });
    expect(frames.size).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(offscreen.classList.contains("lp-reveal-pending")).toBe(false);
    expect(removeReduced).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removePointer).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(removeWindow).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeSurface).toHaveBeenCalledWith("focusin", expect.any(Function));
    expect(removeSurface).toHaveBeenCalledWith(
      "pointermove",
      expect.any(Function),
    );
    expect(removeSurface).toHaveBeenCalledWith(
      "pointerleave",
      expect.any(Function),
    );
    // Supply the standard cleanup with a fresh, empty root.
    root = createRoot(container);
  });
});
