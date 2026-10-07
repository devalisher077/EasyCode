// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialog } from "./useDialog";

function Harness({
  onClose = () => {},
  detailsOpen = false,
}: {
  onClose?: () => void;
  detailsOpen?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(true, onClose, ref);
  return (
    <div role="dialog" ref={ref}>
      <button id="first">Close</button>
      <button id="disabled" disabled>
        Unavailable
      </button>
      <button id="hidden" style={{ display: "none" }}>
        Hidden
      </button>
      <div hidden>
        <button id="hidden-child">Hidden child</button>
      </div>
      <button id="skipped" tabIndex={-1}>
        Not tabbable
      </button>
      <details open={detailsOpen}>
        <summary id="summary">Slide transcript</summary>
        <div tabIndex={0} id="transcript">
          Readable slide text
        </div>
      </details>
    </div>
  );
}

let root: Root;
let container: HTMLDivElement;
const node = (id: string) => document.getElementById(id)!;
async function mount(props: Parameters<typeof Harness>[0] = {}) {
  await act(async () => root.render(<Harness {...props} />));
}
async function tab(shiftKey = false) {
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("useDialog", () => {
  it("includes summary but excludes disabled, hidden and collapsed content from the tab loop", async () => {
    await mount();
    expect(document.activeElement).toBe(node("first"));
    await tab(true);
    expect(document.activeElement).toBe(node("summary"));
    await tab();
    expect(document.activeElement).toBe(node("first"));
  });

  it("includes an expanded transcript and updates the tab loop without remounting", async () => {
    await mount();
    await mount({ detailsOpen: true });
    node("first").focus();
    await tab(true);
    expect(document.activeElement).toBe(node("transcript"));
    await tab();
    expect(document.activeElement).toBe(node("first"));
  });

  it("targets the supplied dialog instead of another earlier dialog on the page", async () => {
    const earlier = document.createElement("div");
    earlier.setAttribute("role", "dialog");
    const otherButton = document.createElement("button");
    earlier.append(otherButton);
    document.body.prepend(earlier);
    await mount();
    expect(document.activeElement).toBe(node("first"));
    otherButton.focus();
    await tab();
    expect(document.activeElement).toBe(node("first"));
    earlier.remove();
  });

  it("calls the current close handler on Escape", async () => {
    const oldClose = vi.fn();
    const nextClose = vi.fn();
    await mount({ onClose: oldClose });
    await mount({ onClose: nextClose });
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(oldClose).not.toHaveBeenCalled();
    expect(nextClose).toHaveBeenCalledOnce();
  });
});
