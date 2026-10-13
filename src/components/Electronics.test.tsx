// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Electronics from "./Electronics";
import { EXERCISES, starterCircuit } from "../../shared/electronics";

vi.mock("./BlockEditor", () => ({
  default: ({
    onChange,
  }: {
    onChange: (source: string, state: object) => void;
  }) => {
    useEffect(() => {
      onChange("led.on()\nwait(500)\n", { blocks: {} });
    }, []);
    return <div data-testid="electronics-blocks">Блоки электроники</div>;
  },
}));
let container: HTMLDivElement, root: Root;
const notice = vi.fn();
async function render(owner = "student-a") {
  await act(async () => {
    root.render(
      <Electronics key={owner} draftOwner={owner} onNotice={notice} />,
    );
  });
}
const button = (text: string) => {
  const item = [...container.querySelectorAll("button")].find(
    (b) =>
      b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
  );
  if (!item) throw new Error(`Missing button: ${text}`);
  return item;
};
async function click(text: string) {
  await act(async () => button(text).click());
}
async function exercise(value: string) {
  await act(async () => {
    const select =
      container.querySelector<HTMLSelectElement>("#circuit-exercise")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  notice.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("virtual electronics workspace", () => {
  it("connects contacts, deletes a wire and restores it with undo", async () => {
    await render();
    expect(container.querySelectorAll(".electronics-wires path")).toHaveLength(
      3,
    );
    await click("Удалить провод Светодиод · K — Плата EasyBoard · GND");
    expect(container.querySelectorAll(".electronics-wires path")).toHaveLength(
      2,
    );
    expect(
      container.querySelector(".electronics-issues")?.textContent,
    ).toContain("Соберите цепь");
    await click("Контакт Светодиод · K");
    await click("Контакт Плата EasyBoard · GND");
    expect(container.querySelectorAll(".electronics-wires path")).toHaveLength(
      3,
    );
    expect(container.querySelector(".electronics-issues")).toBeNull();
    await click("Отменить изменение схемы");
    expect(container.querySelectorAll(".electronics-wires path")).toHaveLength(
      2,
    );
  });
  it("removes a component with all its wires and allows adding it back", async () => {
    await render();
    await click("Переместить: Резистор");
    await click("Удалить деталь");
    expect(container.querySelectorAll(".electronics-part")).toHaveLength(2);
    expect(container.querySelectorAll(".electronics-wires path")).toHaveLength(
      1,
    );
    const libraryButton = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".electronics-library button",
      ),
    ].find((b) => b.textContent?.startsWith("Резистор"))!;
    await act(async () => libraryButton.click());
    expect(container.querySelectorAll(".electronics-part")).toHaveLength(3);
  });
  it("runs and stops without leaving pending timers or a glowing LED", async () => {
    await render();
    vi.useFakeTimers();
    await click("Запустить симуляцию");
    expect(
      container
        .querySelector(".electronics-led-status")
        ?.classList.contains("is-on"),
    ).toBe(true);
    await click("Остановить симуляцию");
    expect(
      container
        .querySelector(".electronics-led-status")
        ?.classList.contains("is-on"),
    ).toBe(false);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(
      container
        .querySelector(".electronics-led-status")
        ?.classList.contains("is-on"),
    ).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("responds to the button while simulation is running and self-checks both branches", async () => {
    await render();
    await exercise("button");
    await click("Пример программы");
    vi.useFakeTimers();
    await click("Запустить симуляцию");
    expect(
      container
        .querySelector(".electronics-led-status")
        ?.classList.contains("is-on"),
    ).toBe(false);
    await click("Нажать кнопку");
    expect(
      container
        .querySelector(".electronics-led-status")
        ?.classList.contains("is-on"),
    ).toBe(true);
    await click("Отпустить кнопку");
    expect(
      container
        .querySelector(".electronics-led-status")
        ?.classList.contains("is-on"),
    ).toBe(false);
    await click("Остановить симуляцию");
    await click("Проверить задание");
    expect(
      container.querySelector(".electronics-check.is-success"),
    ).not.toBeNull();
  });
  it("persists circuit and code per owner, and restores after remount", async () => {
    await render();
    await exercise("night");
    await click("Пример программы");
    await click("Сохранить");
    const saved = JSON.parse(
      localStorage.getItem("easycode:electronics:v1:student-a")!,
    );
    expect(saved.code).toBe(EXERCISES.night.example);
    expect(saved.circuit).toEqual(starterCircuit("night"));
    await render("student-b");
    expect(
      container.querySelector<HTMLSelectElement>("#circuit-exercise")!.value,
    ).toBe("blink");
    await render("student-a");
    expect(
      container.querySelector<HTMLTextAreaElement>(
        '[aria-label="Код электроники"]',
      )!.value,
    ).toBe(EXERCISES.night.example);
    expect(container.querySelector(".part-sensor")).not.toBeNull();
  });
  it("falls back safely when a saved draft is malformed", async () => {
    localStorage.setItem(
      "easycode:electronics:v1:student-a",
      '{"circuit":{"parts":[{"kind":"constructor"}],"wires":[]},"exercise":"night","code":"led.on()"}',
    );
    await render();
    expect(container.querySelectorAll(".electronics-part")).toHaveLength(3);
    expect(container.querySelector(".part-controller")).not.toBeNull();
  });
  it("keeps the current workspace when cancelling an example or preset replacement", async () => {
    await render();
    vi.mocked(window.confirm).mockReturnValue(false);
    await exercise("night");
    expect(
      container.querySelector<HTMLSelectElement>("#circuit-exercise")!.value,
    ).toBe("blink");
    expect(container.querySelector(".part-sensor")).toBeNull();
    await click("Пример программы");
    expect(
      container.querySelector('[data-testid="electronics-blocks"]'),
    ).not.toBeNull();
  });
});
