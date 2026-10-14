// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WORLD } from "../../shared/simulator";
import type {
  Classroom as ClassType,
  CustomSection,
  Role,
  Task,
} from "../lib/types";
import { Classroom } from "./Classroom";

const { request, download, upload } = vi.hoisted(() => ({
  request: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("../lib/api", () => ({ api: request, downloadMaterial: download, uploadClassMaterial: upload }));

const firstClass: ClassType = {
  id: "class-a",
  name: "4 А",
  teacher_id: "teacher",
  join_code: "EASY42",
  member_count: 2,
};
const secondClass: ClassType = {
  id: "class-b",
  name: "4 Б",
  teacher_id: "teacher",
  join_code: "EASY43",
  member_count: 3,
};
const firstLesson: CustomSection = {
  id: "lesson-a",
  class_id: firstClass.id,
  title: "Линейный алгоритм",
  theory: "Каждая команда выполняется по порядку.",
  position: 1,
};
const firstTask: Task = {
  id: "task-a",
  class_id: firstClass.id,
  section_id: firstLesson.id,
  title: "Найди финиш",
  description: "Построй маршрут машины к финишу.",
  difficulty: "easy",
  world: DEFAULT_WORLD,
};

let root: Root;
let container: HTMLDivElement;
let notices = vi.fn<(message: string) => void>();
let practice = vi.fn<(task: Task) => void>();
let classList: ClassType[];
let lessonList: CustomSection[];
let taskList: Task[];

function handleRequest(path: string, body?: Record<string, unknown>) {
  if (path === "/classes" && !body)
    return Promise.resolve({ classes: classList });
  if (path.startsWith("/sections?"))
    return Promise.resolve({ sections: lessonList });
  if (path.startsWith("/tasks?")) return Promise.resolve({ tasks: taskList });
  if (path.startsWith("/submissions?"))
    return Promise.resolve({ submissions: [] });
  return Promise.resolve({});
}

async function render(role: Role = "teacher", ownerId = "") {
  await act(async () => {
    root.render(
      <Classroom role={role} ownerId={ownerId} onNotice={notices} onPractice={practice} />,
    );
  });
}

function button(text: string) {
  const result = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === text,
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}

async function click(text: string) {
  await act(async () => {
    button(text).click();
  });
}

function fill(name: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  )!;
  input.value = value;
}

async function submit() {
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function chooseFile(name: string, file: File) {
  const input = container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

function prepareLessonCreation() {
  request.mockImplementation((path: string, body?: Record<string, unknown>) => {
    if (path === "/sections" && body) {
      const section = { ...firstLesson, id: "lesson-new", title: String(body.title), theory: String(body.theory) };
      lessonList.push(section);
      return Promise.resolve({ section });
    }
    return handleRequest(path, body);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  request.mockReset();
  request.mockImplementation(handleRequest);
  download.mockReset();
  upload.mockReset().mockResolvedValue({ material: { id: "new-material" } });
  classList = [firstClass];
  lessonList = [firstLesson];
  taskList = [firstTask];
  notices = vi.fn();
  practice = vi.fn();
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
});

describe("Classroom", () => {
  it("keeps a creation error visible in the dialog and allows retry", async () => {
    classList = [];
    let attempts = 0;
    request.mockImplementation((path: string, body?: Record<string, unknown>) => {
      if (path === "/classes" && body) {
        if (++attempts === 1) return Promise.reject(new Error("Этот источник запроса не разрешён."));
        classList = [firstClass];
        return Promise.resolve({ class: firstClass });
      }
      return handleRequest(path, body);
    });
    await render();
    await click("Создать первый класс");
    fill("title", "4 А");
    await submit();
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent)
      .toContain("Этот источник запроса не разрешён.");
    expect(container.querySelector<HTMLInputElement>('[name="title"]')?.value).toBe("4 А");
    await submit();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector(".class-overview")?.textContent).toContain("4 А");
  });

  it("shows invalid code feedback and lets a student join another class", async () => {
    request.mockImplementation((path: string, body?: Record<string, unknown>) => {
      if (path === "/classes/join") {
        if (body?.code !== "EASY43") return Promise.reject(new Error("Код не найден. Уточните его у учителя."));
        classList = [firstClass, secondClass];
        return Promise.resolve({ class: secondClass });
      }
      return handleRequest(path, body);
    });
    await render("student");
    await click("Присоединиться по коду");
    fill("code", "NOPE");
    await submit();
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain("Код не найден");
    fill("code", " easy43 ");
    await submit();
    expect(request).toHaveBeenCalledWith("/classes/join", { code: "EASY43" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector(".class-overview")?.textContent).toContain("4 Б");
  });
  it("creates a class from the teacher empty state and selects it", async () => {
    classList = [];
    request.mockImplementation(
      (path: string, body?: Record<string, unknown>) => {
        if (path === "/classes" && body) {
          classList = [firstClass];
          return Promise.resolve({ class: firstClass });
        }
        return handleRequest(path, body);
      },
    );
    await render();
    expect(container.querySelector("h1")?.textContent).toBe("Кабинет учителя");
    await click("Создать первый класс");
    fill("title", "4 А");
    await submit();
    expect(request).toHaveBeenCalledWith("/classes", { name: "4 А" });
    expect(container.querySelector("[role=dialog]")).toBeNull();
    expect(container.querySelector(".class-overview")?.textContent).toContain(
      "4 А",
    );
    expect(container.textContent).toContain("EASY42");
  });

  it("publishes teacher-created lesson theory in the selected class", async () => {
    request.mockImplementation(
      (path: string, body?: Record<string, unknown>) => {
        if (path === "/sections" && body) {
          lessonList.push({
            id: "lesson-new",
            class_id: String(body.classId),
            title: String(body.title),
            theory: String(body.theory),
            position: 2,
          });
        }
        return handleRequest(path, body);
      },
    );
    await render();
    await click("Новый урок");
    expect(container.querySelector("[role=dialog]")?.textContent).toContain(
      "Класс «4 А»",
    );
    fill("title", "Повторяем команды");
    fill("theory", "Цикл повторяет команды несколько раз.");
    await submit();
    expect(request).toHaveBeenCalledWith("/sections", {
      classId: "class-a",
      title: "Повторяем команды",
      theory: "Цикл повторяет команды несколько раз.",
    }, undefined);
    expect(container.textContent).toContain(
      "Цикл повторяет команды несколько раз.",
    );
    expect(container.querySelector("[role=dialog]")).toBeNull();
    expect(notices).toHaveBeenCalledWith(
      expect.stringContaining("Урок создан"),
    );
  });

  it("attaches a presentation to the newly created lesson and refreshes materials", async () => {
    prepareLessonCreation();
    await render("teacher", "teacher-1");
    await click("Новый урок");
    fill("title", "Урок с презентацией");
    fill("theory", "Объяснение темы");
    const pdf = new File(["%PDF-test"], "slides.pdf", { type: "application/pdf" });
    await chooseFile("lessonFile", pdf);
    const readsBefore = request.mock.calls.filter(([path]) => path.startsWith("/class-materials?")).length;
    await submit();
    expect(request).toHaveBeenCalledWith("/sections", { classId: "class-a", title: "Урок с презентацией", theory: "Объяснение темы" }, { expectedUserId: "teacher-1" });
    expect(upload).toHaveBeenCalledWith({ classId: "class-a", sectionId: "lesson-new", expectedUserId: "teacher-1", title: "Урок с презентацией", file: pdf, preview: undefined });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(notices).toHaveBeenCalledWith("Урок и презентация доступны ученикам класса.");
    expect(request.mock.calls.filter(([path]) => path.startsWith("/class-materials?")).length).toBeGreaterThan(readsBefore);
  });

  it("requires and uploads a PDF companion for PowerPoint", async () => {
    prepareLessonCreation();
    await render("teacher", "teacher-1");
    await click("Новый урок");
    fill("title", "Алгоритмы"); fill("theory", "Теория");
    const pptx = new File(["PK-test"], "slides.pptx");
    const pdf = new File(["%PDF-test"], "slides.pdf");
    await chooseFile("lessonFile", pptx);
    expect(button("Создать урок").disabled).toBe(true);
    await submit(); // Validation also guards programmatic submission.
    expect(request.mock.calls.some(([path]) => path === "/sections")).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    await chooseFile("lessonPreview", pdf);
    await submit();
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ file: pptx, preview: pdf, sectionId: "lesson-new" }));
  });

  it("retries a failed presentation upload without creating a duplicate lesson", async () => {
    prepareLessonCreation();
    upload.mockRejectedValueOnce(new Error("Ошибка загрузки"));
    await render("teacher", "teacher-1");
    await click("Новый урок");
    fill("title", "Алгоритмы"); fill("theory", "Теория");
    const pdf = new File(["%PDF-test"], "slides.pdf");
    await chooseFile("lessonFile", pdf);
    await submit();
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain("Ошибка загрузки");
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Урок уже сохранён");
    expect(container.querySelector<HTMLInputElement>('[name="title"]')?.readOnly).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>('[name="theory"]')?.value).toBe("Теория");
    expect(button("Повторить загрузку презентации").disabled).toBe(false);
    await submit();
    expect(request.mock.calls.filter(([path]) => path === "/sections")).toHaveLength(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls.every(([input]) => input.sectionId === "lesson-new")).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("rejects invalid or oversized attachments before saving lesson theory", async () => {
    prepareLessonCreation();
    await render(); await click("Новый урок");
    fill("title", "Алгоритмы"); fill("theory", "Теория");
    const large = new File(["test"], "large.pdf");
    Object.defineProperty(large, "size", { value: 20 * 1024 * 1024 + 1 });
    for (const file of [new File(["test"], "slides.exe"), new File([], "empty.pdf"), large]) {
      await chooseFile("lessonFile", file); await submit();
      expect(container.querySelector('[role="dialog"] [role="alert"]')).not.toBeNull();
    }
    expect(request.mock.calls.some(([path]) => path === "/sections")).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not upload under another account when lesson creation resolves late", async () => {
    const pending = deferred<{ section: CustomSection }>();
    request.mockImplementation((path, body) => path === "/sections" ? pending.promise : handleRequest(path, body));
    await render("teacher", "teacher-1"); await click("Новый урок");
    fill("title", "Алгоритмы"); fill("theory", "Теория");
    await chooseFile("lessonFile", new File(["%PDF-test"], "slides.pdf"));
    await submit();
    await render("teacher", "teacher-2");
    await act(async () => pending.resolve({ section: firstLesson }));
    expect(upload).not.toHaveBeenCalled();
    expect(notices).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("preselects the lesson when adding its practice task", async () => {
    await render();
    await click("Добавить задание к уроку");
    expect(
      container.querySelector<HTMLSelectElement>("[name=sectionId]")?.value,
    ).toBe("lesson-a");
    fill("title", "Первый маршрут");
    fill("description", "Доведи машину до финиша без столкновений.");
    await submit();
    expect(request).toHaveBeenCalledWith(
      "/tasks",
      expect.objectContaining({
        classId: "class-a",
        sectionId: "lesson-a",
        title: "Первый маршрут",
        world: DEFAULT_WORLD,
      }),
    );
  });

  it("shows students read-only lessons and opens linked practice", async () => {
    await render("student");
    expect(container.querySelector("h1")?.textContent).toBe("Мой класс");
    const labels = [...container.querySelectorAll("button")].map((item) =>
      item.textContent?.trim(),
    );
    expect(labels).not.toContain("Создать класс");
    expect(labels).not.toContain("Новый урок");
    expect(labels).not.toContain("Добавить задание к уроку");
    expect(container.querySelector(".invite-code")).toBeNull();
    await click("Найди финиш");
    expect(practice).toHaveBeenCalledWith(firstTask);
  });

  it("lets a student join a class using a normalized invitation code", async () => {
    classList = [];
    request.mockImplementation(
      (path: string, body?: Record<string, unknown>) => {
        if (path === "/classes/join") {
          classList = [firstClass];
          return Promise.resolve({ class: firstClass });
        }
        return handleRequest(path, body);
      },
    );
    await render("student");
    await click("Ввести код учителя");
    fill("code", " easy42 ");
    await submit();
    expect(request).toHaveBeenCalledWith("/classes/join", { code: "EASY42" });
    expect(container.querySelector(".class-overview")?.textContent).toContain(
      "4 А",
    );
  });

  it("ignores content from a previously selected class that loads late", async () => {
    classList = [firstClass, secondClass];
    const lateLessons = deferred<{ sections: CustomSection[] }>();
    const secondLesson = {
      ...firstLesson,
      id: "lesson-b",
      class_id: "class-b",
      title: "Урок класса Б",
    };
    request.mockImplementation(
      (path: string, body?: Record<string, unknown>) => {
        if (path === "/sections?classId=class-a") return lateLessons.promise;
        if (path === "/sections?classId=class-b")
          return Promise.resolve({ sections: [secondLesson] });
        return handleRequest(path, body);
      },
    );
    await render();
    await click("4 Б");
    expect(container.textContent).toContain("Урок класса Б");
    await act(async () => {
      lateLessons.resolve({ sections: [firstLesson] });
    });
    expect(container.textContent).toContain("Урок класса Б");
    expect(container.textContent).not.toContain("Линейный алгоритм");
  });

  it("ignores a teacher class response after switching to a student session", async () => {
    const lateClasses = deferred<{ classes: ClassType[] }>();
    request.mockImplementationOnce(() => lateClasses.promise);
    await render("teacher");
    classList = [];
    await render("student");
    await act(async () => {
      lateClasses.resolve({ classes: [firstClass] });
    });
    expect(container.textContent).toContain(
      "Вы пока не присоединились к классу",
    );
    expect(container.querySelector(".class-overview")).toBeNull();
  });

  it("shows a retry state instead of another class's lessons when loading fails", async () => {
    request.mockImplementation(
      (path: string, body?: Record<string, unknown>) =>
        path.startsWith("/sections?")
          ? Promise.reject(new Error("Материалы недоступны"))
          : handleRequest(path, body),
    );
    await render();
    expect(container.querySelector("[role=alert]")?.textContent).toContain(
      "Материалы недоступны",
    );
    expect(container.querySelector(".custom-section")).toBeNull();
    request.mockImplementation(handleRequest);
    await click("Повторить загрузку");
    expect(container.textContent).toContain("Линейный алгоритм");
  });
});
