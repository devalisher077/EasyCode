// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Lesson,
  LessonCheckResponse,
  LessonProgress,
} from "../../shared/lessons";
import { useLessonProgress } from "./useLessonProgress";

// Never evaluate the real API module: it can initialise configured Supabase.
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./api", () => ({ api: mocks.api }));

type Props = Parameters<typeof useLessonProgress>[0];
const guest: Props = { ownerId: "guest", cloud: false, enabled: true };
const lesson: Lesson = {
  id: "1.1",
  title: "Алгоритм",
  sectionNumber: 1,
  sectionTitle: "Алгоритмы",
  description: "Учебная тема",
  durationMinutes: 10,
  goals: [],
  steps: [
    { id: "read", title: "Прочитай", paragraphs: ["Теория"] },
    { id: "try", title: "Попробуй", paragraphs: ["Практика"] },
  ],
  quiz: [
    { id: "q1", prompt: "Команда?", options: [{ id: "a", text: "Вперёд" }] },
  ],
  practice: { title: "Маршрут", instructions: [], availableInSimulator: true },
  source: { kind: "new", label: "Тест" },
};
const entry = (changes: Partial<LessonProgress> = {}): LessonProgress => ({
  lessonId: lesson.id,
  completedStepIds: [],
  bestScore: null,
  quizPassed: false,
  completedAt: null,
  updatedAt: "2026-10-07T00:00:00.000Z",
  ...changes,
});
const checked = (
  score: number,
  passed: boolean,
  progress: LessonProgress | null = null,
): LessonCheckResponse => ({
  result: {
    score,
    total: 1,
    passed,
    feedback: [
      { questionId: "q1", correct: passed, explanation: "Объяснение" },
    ],
  },
  progress,
});
const storageKey = (owner: string) =>
  `easycode:lesson-progress:v1:${encodeURIComponent(owner)}`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useLessonProgress>;
function Harness(props: Props) {
  state = useLessonProgress(props);
  return null;
}
async function render(props: Props) {
  await act(async () => {
    root.render(<Harness {...props} />);
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  mocks.api.mockReset();
  // Fail closed if a new code path unexpectedly tries a real request.
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

describe("useLessonProgress", () => {
  it("persists guest steps and restores them after a fresh mount without API calls", async () => {
    await render(guest);
    expect(state.storage).toBe("local");
    await act(async () => {
      await state.markStep(lesson, "read");
      await state.markStep(lesson, "read");
      await state.markStep(lesson, "unknown");
    });
    expect(state.progress[lesson.id].completedStepIds).toEqual(["read"]);
    expect(
      JSON.parse(localStorage.getItem(storageKey("guest"))!)[lesson.id]
        .completedStepIds,
    ).toEqual(["read"]);
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await render(guest);
    expect(state.progress[lesson.id].completedStepIds).toEqual(["read"]);
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("checks guest quizzes anonymously and never lowers a best score or completed status", async () => {
    await render(guest);
    mocks.api
      .mockResolvedValueOnce(checked(100, true))
      .mockResolvedValueOnce(checked(0, false));
    await act(async () => {
      await state.markStep(lesson, "read");
      await state.markStep(lesson, "try");
      await state.checkQuiz(lesson, { q1: "a" });
    });
    const completedAt = state.progress[lesson.id].completedAt;
    expect(completedAt).toEqual(expect.any(String));
    await act(async () => {
      await state.checkQuiz(lesson, { q1: "wrong" });
    });
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/lessons/1.1/check",
      { answers: { q1: "wrong" } },
      { anonymous: true },
    );
    expect(state.progress[lesson.id]).toMatchObject({
      bestScore: 100,
      quizPassed: true,
      completedAt,
    });
    expect(state.storage).toBe("local");
    expect(state.error).toBe("");
  });

  it("pins every cloud request to the expected account", async () => {
    mocks.api.mockResolvedValueOnce({ progress: [] });
    await render({ ownerId: "alice", cloud: true, enabled: true });
    expect(mocks.api).toHaveBeenLastCalledWith("/lesson-progress", undefined, {
      expectedUserId: "alice",
    });
    mocks.api.mockResolvedValueOnce({
      progress: entry({ completedStepIds: ["read"] }),
    });
    await act(async () => {
      await state.markStep(lesson, "read");
    });
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/lessons/1.1/progress",
      { stepId: "read" },
      { expectedUserId: "alice" },
    );
    mocks.api.mockResolvedValueOnce(
      checked(
        100,
        true,
        entry({ completedStepIds: ["read"], bestScore: 100, quizPassed: true }),
      ),
    );
    await act(async () => {
      await state.checkQuiz(lesson, { q1: "a" });
    });
    expect(mocks.api).toHaveBeenLastCalledWith(
      "/lessons/1.1/check",
      { answers: { q1: "a" } },
      { expectedUserId: "alice" },
    );
    expect(state.storage).toBe("cloud");
  });

  it("uses explicit demo mode without pinning a nonexistent Supabase account", async () => {
    mocks.api.mockResolvedValueOnce({ progress: [] });
    await render({
      ownerId: "demo-student",
      cloud: true,
      enabled: true,
      demo: true,
    });
    mocks.api.mockResolvedValueOnce({
      progress: entry({ completedStepIds: ["read"] }),
    });
    await act(async () => {
      await state.markStep(lesson, "read");
    });
    mocks.api.mockResolvedValueOnce(
      checked(100, true, entry({ bestScore: 100, quizPassed: true })),
    );
    await act(async () => {
      await state.checkQuiz(lesson, { q1: "a" });
    });
    expect(mocks.api).toHaveBeenCalledTimes(3);
    for (const call of mocks.api.mock.calls) expect(call[2]).toBeUndefined();
  });

  it("isolates local accounts and ignores an old account's late cloud load", async () => {
    const oldLoad = deferred<{ progress: LessonProgress[] }>();
    mocks.api
      .mockReturnValueOnce(oldLoad.promise)
      .mockResolvedValueOnce({ progress: [] });
    localStorage.setItem(
      storageKey("guest"),
      JSON.stringify({ [lesson.id]: entry({ completedStepIds: ["try"] }) }),
    );
    await render({ ownerId: "alice", cloud: true, enabled: true });
    expect(state.storage).toBe("loading");
    await render({ ownerId: "bob", cloud: true, enabled: true });
    await act(async () => {
      oldLoad.resolve({ progress: [entry({ completedStepIds: ["read"] })] });
    });
    expect(state.progress).toEqual({});
    expect(localStorage.getItem(storageKey("alice"))).toBeNull();
    await render(guest);
    expect(state.progress[lesson.id].completedStepIds).toEqual(["try"]);
    await render({ ownerId: "bob", cloud: false, enabled: true });
    expect(state.progress).toEqual({});
  });

  it("discards a late step write and rejects a late quiz after switching accounts", async () => {
    mocks.api.mockResolvedValueOnce({ progress: [] });
    await render({ ownerId: "alice", cloud: true, enabled: true });
    const oldWrite = deferred<{ progress: LessonProgress }>();
    const oldQuiz = deferred<LessonCheckResponse>();
    mocks.api
      .mockReturnValueOnce(oldWrite.promise)
      .mockReturnValueOnce(oldQuiz.promise);
    const pendingWrite = state.markStep(lesson, "read");
    const pendingQuiz = state
      .checkQuiz(lesson, { q1: "a" })
      .catch((error: Error) => error);
    mocks.api.mockResolvedValueOnce({ progress: [] });
    await render({ ownerId: "bob", cloud: true, enabled: true });
    await act(async () => {
      oldWrite.resolve({ progress: entry({ completedStepIds: ["read"] }) });
      oldQuiz.resolve(
        checked(100, true, entry({ bestScore: 100, quizPassed: true })),
      );
      await pendingWrite;
    });
    expect(await pendingQuiz).toEqual(
      new Error("Аккаунт изменился. Открой тему заново."),
    );
    expect(state.progress).toEqual({});
    expect(JSON.parse(localStorage.getItem(storageKey("bob"))!)).toEqual({});
  });

  it("warns on a cloud load failure and keeps fallback steps local after quiz checking", async () => {
    localStorage.setItem(
      storageKey("alice"),
      JSON.stringify({ [lesson.id]: entry({ completedStepIds: ["read"] }) }),
    );
    mocks.api.mockRejectedValueOnce(new Error("offline"));
    await render({ ownerId: "alice", cloud: true, enabled: true });
    expect(state.storage).toBe("local");
    expect(state.error).toContain("не синхронизируются автоматически");
    await act(async () => {
      await state.markStep(lesson, "try");
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    mocks.api.mockResolvedValueOnce({
      ...checked(100, true),
      warning: "Сервер не сохранил результат.",
    });
    await act(async () => {
      await state.checkQuiz(lesson, { q1: "a" });
    });
    expect(state.storage).toBe("local");
    expect(state.error).toContain("Сервер не сохранил результат.");
    expect(state.error).toContain("не синхронизируются автоматически");
    expect(state.progress[lesson.id]).toMatchObject({
      completedStepIds: ["read", "try"],
      bestScore: 100,
      quizPassed: true,
    });
  });

  it("falls back locally when a cloud step write fails", async () => {
    mocks.api.mockResolvedValueOnce({ progress: [] });
    await render({ ownerId: "alice", cloud: true, enabled: true });
    mocks.api.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await state.markStep(lesson, "read");
    });
    expect(state.storage).toBe("local");
    expect(state.error).toContain("Облачный прогресс сейчас недоступен");
    expect(state.progress[lesson.id].completedStepIds).toEqual(["read"]);
  });

  it("keeps in-memory progress and clearly warns when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    await render(guest);
    await act(async () => {
      await state.markStep(lesson, "read");
    });
    expect(state.storage).toBe("unavailable");
    expect(state.error).toContain("только до закрытия или обновления страницы");
    expect(state.progress[lesson.id].completedStepIds).toEqual(["read"]);
  });

  it("does not read or submit progress while the profile is disabled", async () => {
    await render({ ownerId: "alice", cloud: true, enabled: false });
    await act(async () => {
      await state.markStep(lesson, "read");
    });
    await expect(state.checkQuiz(lesson, { q1: "a" })).rejects.toThrow(
      "загружаем профиль",
    );
    expect(mocks.api).not.toHaveBeenCalled();
    expect(state.progress).toEqual({});
  });
});
