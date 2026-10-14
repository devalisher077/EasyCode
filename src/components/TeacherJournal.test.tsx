// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TeacherJournal, StudentGrades } from "./TeacherJournal";
import type { StudentReport } from "../../shared/review";
const mocks = vi.hoisted(() => ({ api: vi.fn(), blocks: vi.fn() }));
vi.mock("../lib/api", () => ({ api: mocks.api, supabase: null }));
vi.mock("./BlockEditor", () => ({
  default: (props: unknown) => {
    mocks.blocks(props);
    return <div>Saved blocks</div>;
  },
}));
const students = [
  { id: "one", name: "Алия", role: "student" },
  { id: "two", name: "Данияр", role: "student" },
];
const report: StudentReport = {
  progress: [
    {
      lessonId: "1.1",
      completedStepIds: ["one"],
      bestScore: 1,
      quizPassed: false,
      completedAt: null,
      updatedAt: "2026-10-14T10:00:00Z",
    },
  ],
  attempts: [
    {
      id: "attempt",
      task_id: "course-1-1",
      lesson_id: "1.1",
      success: false,
      kind: "robot",
      created_at: "2026-10-14T10:00:00Z",
    },
  ],
  grades: [],
  lessons: [
    {
      id: "1.1",
      title: "Что такое алгоритм?",
      sectionNumber: 1,
      sectionTitle: "Алгоритмы",
      stepIds: ["one", "two"],
      stepTitles: ["Определение", "Примеры"],
      quizTotal: 3,
    },
  ],
};
let root: Root;
let container: HTMLDivElement;
const detail = {
  ...report.attempts[0],
  code: "robot.forward(2)",
  editor_mode: "blocks",
  feedback: "Проверь маршрут",
  blocks_state: { blocks: { blocks: [] } },
  task_snapshot: null,
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.api.mockReset().mockImplementation(async (path: string) => {
    if (path.endsWith("/students")) return { students };
    if (path.endsWith("/progress")) return report;
    if (path.includes("/attempts/")) return { attempt: detail };
    if (path.endsWith("/my-grades")) return { grades: [] };
    return {
      grade: {
        class_id: "class",
        student_id: "one",
        teacher_id: "teacher",
        section_key: "course:1",
        score: 8,
        comment: "Хорошо",
        updated_at: "2026-10-14T10:00:00Z",
      },
    };
  });
  mocks.blocks.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render() {
  await act(async () =>
    root.render(
      <TeacherJournal
        classId="class"
        ownerId="teacher"
        sections={[]}
        tasks={[]}
      />,
    ),
  );
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
async function selectStudent(id: string) {
  const select = container.querySelector("select")!;
  await act(async () => {
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function setInput(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector,
  )!;
  const proto =
    input.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("shows actual theory progress, failed attempts, read-only blocks and exact code", async () => {
  await render();
  expect(container.textContent).toContain("33%");
  expect(container.textContent).toContain("Отправлено, нужна доработка");
  expect(container.querySelector("progress")?.value).toBe(33);
  await click("Посмотреть решение");
  expect(container.querySelector("pre")?.textContent).toBe(detail.code);
  expect(mocks.blocks).toHaveBeenCalledWith(
    expect.objectContaining({
      readOnly: true,
      initialState: detail.blocks_state,
    }),
  );
  expect(container.textContent).toContain(
    "Для старой попытки карта не сохранена",
  );
});
it("keeps old successful attempts in history without crediting the new practice", async () => {
  mocks.api.mockImplementation(async (path: string) =>
    path.endsWith("/students")
      ? { students }
      : path.endsWith("/progress")
        ? {
            ...report,
            attempts: [
              { ...report.attempts[0], task_id: "intro-route", success: true },
            ],
          }
        : {},
  );
  await render();
  expect(container.querySelector(".journal-lesson")?.textContent).toContain(
    "Практика: Не отправлено",
  );
  expect(container.textContent).toContain("Выполнено заданий: 0 из 1");
  expect(container.querySelectorAll(".journal-attempt")).toHaveLength(1);
});
it("saves a grade against the selected student and section", async () => {
  await render();
  await setInput('input[type="number"]', "8");
  await setInput("textarea", "Хорошо");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(mocks.api).toHaveBeenCalledWith(
    "/classes/class/students/one/grades",
    { sectionKey: "course:1", score: 8, comment: "Хорошо" },
    undefined,
  );
  expect(container.textContent).toContain("Оценка сохранена.");
  expect(container.textContent).toContain("Последняя оценка: 8/10");
});
it("does not show a solution that finishes loading after changing student", async () => {
  let resolve!: (value: unknown) => void;
  const original = mocks.api.getMockImplementation()!;
  mocks.api.mockImplementation((path: string) =>
    path.includes("/attempts/")
      ? new Promise((r) => {
          resolve = r;
        })
      : original(path),
  );
  await render();
  await click("Посмотреть решение");
  await selectStudent("two");
  await act(async () => resolve({ attempt: detail }));
  expect(container.querySelector("pre")).toBeNull();
  expect(container.textContent).not.toContain("Saved blocks");
});
it("reports unavailable data instead of showing zero progress", async () => {
  const original = mocks.api.getMockImplementation()!;
  mocks.api.mockImplementation((path: string) =>
    path.endsWith("/progress")
      ? Promise.reject(new Error("Журнал недоступен"))
      : original(path),
  );
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Журнал недоступен",
  );
  expect(container.querySelector("progress")).toBeNull();
  expect(container.querySelector("form")).toBeNull();
});
it("loads only the student's own grades in the student view", async () => {
  await act(async () =>
    root.render(<StudentGrades classId="class" sections={[]} />),
  );
  expect(mocks.api).toHaveBeenCalledWith("/classes/class/my-grades");
  expect(container.textContent).toContain("Учитель пока не выставил оценки.");
  expect(container.querySelector("form")).toBeNull();
});
