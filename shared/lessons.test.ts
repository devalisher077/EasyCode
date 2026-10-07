import { describe, expect, it } from "vitest";
import { lessonPercent, type LessonProgress } from "./lessons";

const lesson = { steps: [{ id: "read" }, { id: "try" }] };
const progress: LessonProgress = {
  lessonId: "1.1",
  completedStepIds: [],
  bestScore: null,
  quizPassed: false,
  completedAt: null,
  updatedAt: "2026-10-07T00:00:00.000Z",
};

describe("lessonPercent", () => {
  it("starts at zero and includes the quiz as a required completion step", () => {
    expect(lessonPercent(lesson)).toBe(0);
    expect(lessonPercent(lesson, progress)).toBe(0);
    expect(
      lessonPercent(lesson, { ...progress, completedStepIds: ["read"] }),
    ).toBe(33);
    expect(
      lessonPercent(lesson, { ...progress, completedStepIds: ["read", "try"] }),
    ).toBe(67);
    expect(
      lessonPercent(lesson, {
        ...progress,
        completedStepIds: ["read", "try"],
        quizPassed: true,
      }),
    ).toBe(100);
  });

  it("does not count stale/duplicate step IDs or an unpassed high quiz score", () => {
    expect(
      lessonPercent(lesson, {
        ...progress,
        completedStepIds: ["read", "read", "removed"],
        bestScore: 100,
      }),
    ).toBe(33);
  });

  it("handles a quiz-only lesson without a division-by-zero result", () => {
    expect(lessonPercent({ steps: [] }, progress)).toBe(0);
    expect(
      lessonPercent({ steps: [] }, { ...progress, quizPassed: true }),
    ).toBe(100);
  });
});
