import { describe, expect, it } from "vitest";
import { droneLessons } from "./index";
import { droneFeedback } from "./feedback";
import en from "../../shared/locales/drone-lessons-en.json";
import kk from "../../shared/locales/drone-lessons-kk.json";
import { assessLesson, publicLesson } from "../../server/lessons";
import { evaluateDrone } from "../../shared/drone";

describe("adapted drone learning materials", () => {
  it("has six distinct lessons in the supplied three sections", () => {
    expect(droneLessons.map((l) => l.id)).toEqual([
      "drone-1.1",
      "drone-1.2",
      "drone-2.1",
      "drone-2.2",
      "drone-3.1",
      "drone-3.2",
    ]);
    for (const lesson of droneLessons) {
      expect(lesson.steps).toHaveLength(4);
      expect(new Set(lesson.steps.map((s) => s.id)).size).toBe(4);
      expect(lesson.quiz).toHaveLength(3);
      expect(lesson.practice.availableInSimulator).toBe(true);
      const answers = Object.fromEntries(
        lesson.quiz.map((q) => [q.id, q.correctOptionId]),
      );
      expect(assessLesson(lesson, answers).passed).toBe(true);
      expect(JSON.stringify(publicLesson(lesson))).not.toContain(
        "correctOptionId",
      );
      expect(JSON.stringify(publicLesson(lesson))).not.toContain("explanation");
    }
  });
  for (const [language, copies] of Object.entries({ en, kk })) {
    it(`has a complete ${language} version without answer keys`, () => {
      expect(Object.keys(copies).sort()).toEqual(
        droneLessons.map((l) => l.id).sort(),
      );
      for (const lesson of droneLessons) {
        const copy = copies[lesson.id as keyof typeof copies];
        expect(copy.description).not.toBe("");
        expect(copy.goals).toHaveLength(lesson.goals.length);
        expect(copy.steps).toHaveLength(lesson.steps.length);
        expect(copy.quiz).toHaveLength(lesson.quiz.length);
        expect(copy.practice[1]).toHaveLength(
          lesson.practice.instructions.length,
        );
        copy.quiz.forEach((q, i) =>
          expect(q[1]).toHaveLength(lesson.quiz[i].options.length),
        );
        for (const question of lesson.quiz)
          expect(droneFeedback[question.id][language as "en" | "kk"]).not.toBe(
            "",
          );
      }
      expect(JSON.stringify(copies)).not.toContain("correctOptionId");
      expect(JSON.stringify(copies)).not.toContain("explanation");
    });
  }
  it("has executable examples matching the source routes", () => {
    for (const [id, finish, checkpoints] of [
      ["drone-3.1", { x: 5, y: 0, z: 1 }, []],
      ["drone-3.2", { x: 3, y: 0, z: 2 }, [{ x: 3, y: 2, z: 1 }]],
    ] as const) {
      const code = droneLessons
        .find((l) => l.id === id)!
        .steps.find((s) => s.code)!.code!;
      const result = evaluateDrone(code, {
        id,
        title: id,
        description: id,
        start: { x: 1, y: 0, z: 1 },
        finish,
        checkpoints: [...checkpoints],
        obstacles: [],
      });
      expect(result.success).toBe(true);
    }
  });
});
