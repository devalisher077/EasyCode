// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassMaterials } from "./ClassMaterials";
const mocks = vi.hoisted(() => ({ api: vi.fn(), upload: vi.fn(), download: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api, uploadClassMaterial: mocks.upload, downloadMaterial: mocks.download }));
let root: Root;
let container: HTMLDivElement;
const onPreview = vi.fn();
const onNotice = vi.fn();
const material = { id: "one", title: "Презентация учителя", filename: "slides.pdf", type: "presentation",
  path: "cloud/one/slides.pdf", audience: "student_and_teacher", section_id: "lesson", size_bytes: 123 };
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.api.mockResolvedValue({ materials: [material] }); mocks.upload.mockResolvedValue({ material });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(teacher = true, key = "one") {
  await act(async () => root.render(<ClassMaterials key={key} classId="class" ownerId="owner" teacher={teacher}
    sections={[{ id: "lesson", class_id: "class", title: "Алгоритмы", theory: "", position: 1 }]}
    onPreview={onPreview} onNotice={onNotice} />));
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === text)!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
async function file(name: string, value: File) {
  const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  Object.defineProperty(input, "files", { configurable: true, value: [value] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
describe("class material interface", () => {
  it("lets a student view uploaded PDFs without showing upload controls", async () => {
    await render(false);
    expect(container.textContent).toContain(material.title);
    expect(container.textContent).not.toContain("Загрузить материал");
    await click("Просмотреть");
    expect(onPreview).toHaveBeenCalledWith(material);
  });
  it("uploads PDF with lesson and owner scope and refreshes only after success", async () => {
    await render(); await click("Загрузить материал");
    const pdf = new File(["%PDF-1.7"], "slides.pdf", { type: "application/pdf" });
    await file("file", pdf);
    container.querySelector<HTMLInputElement>('[name="title"]')!.value = "Урок 1";
    container.querySelector<HTMLSelectElement>('[name="sectionId"]')!.value = "lesson";
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.upload).toHaveBeenCalledWith({ classId: "class", expectedUserId: "owner", sectionId: "lesson", title: "Урок 1", file: pdf, preview: undefined });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onNotice).toHaveBeenCalledWith("Материал загружен и доступен ученикам класса.");
  });
  it("requires a PDF companion for PPTX and retains form on upload failure", async () => {
    await render(); await click("Загрузить материал");
    await file("file", new File(["zip"], "slides.pptx"));
    expect(container.querySelector<HTMLInputElement>('[name="preview"]')!.required).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('form button')!.disabled).toBe(true);
    await file("preview", new File(["%PDF-1.7"], "slides.pdf"));
    mocks.upload.mockRejectedValueOnce(new Error("Ошибка загрузки"));
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Ошибка загрузки");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(onNotice).not.toHaveBeenCalled();
  });
});
