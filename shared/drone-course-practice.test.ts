import { describe, it, expect } from "vitest";
import {
  droneCoursePractice,
  dronePracticeForLesson,
  checkDronePractice,
} from "./drone-course-practice";
import { evaluateDrone } from "./drone";

describe("topic-specific drone practices", () => {
  it("provides one distinct exercise for every published topic", () => {
    expect(droneCoursePractice.map((p) => p.lessonId)).toEqual([
      "drone-1.1",
      "drone-1.2",
      "drone-2.1",
      "drone-2.2",
      "drone-3.1",
      "drone-3.2",
    ]);
    expect(new Set(droneCoursePractice.map((p) => p.title)).size).toBe(6);
    expect(dronePracticeForLesson("1.1")).toBeUndefined();
    expect(dronePracticeForLesson("drone-4.1")).toBeUndefined();
  });
  for (const p of droneCoursePractice.filter((p) => p.questions.length)) {
    it(`checks all answers for ${p.lessonId}`, () => {
      expect(checkDronePractice(p.lessonId, {})?.complete).toBe(false);
      expect(
        checkDronePractice(p.lessonId, { [p.questions[0].id]: "invalid" })
          ?.passed,
      ).toBe(false);
      const answers = Object.fromEntries(
        p.questions.map((q) => [q.id, q.correct]),
      );
      expect(checkDronePractice(p.lessonId, answers)?.passed).toBe(true);
      answers[p.questions[0].id] = p.questions[0].options.find(
        (o) => o.id !== p.questions[0].correct,
      )!.id;
      expect(checkDronePractice(p.lessonId, answers)?.passed).toBe(false);
    });
  }
  it("separates local choice checks from flight missions", () => {
    expect(checkDronePractice("drone-3.1", {})).toBeNull();
    expect(checkDronePractice("missing", {})).toBeNull();
    expect(dronePracticeForLesson("drone-3.1")!.mission!.id).not.toBe(
      "first-flight",
    );
  });
  it("accepts the source's straight flight only after landing", () => {
    const mission = dronePracticeForLesson("drone-3.1")!.mission!;
    expect(
      evaluateDrone("drone.takeoff()\ndrone.forward(4)\ndrone.land()", mission)
        .success,
    ).toBe(true);
    expect(
      evaluateDrone("drone.takeoff()\ndrone.forward(4)", mission).success,
    ).toBe(false);
  });
  it("requires the height checkpoint in the source's turn exercise", () => {
    const mission = dronePracticeForLesson("drone-3.2")!.mission!;
    const source =
      "drone.takeoff()\ndrone.forward(2)\ndrone.up(1)\ndrone.turn_right()\ndrone.forward(1)\ndrone.land()";
    expect(evaluateDrone(source, mission).success).toBe(true);
    expect(
      evaluateDrone(source.replace("drone.up(1)\n", ""), mission).success,
    ).toBe(false);
    expect(
      evaluateDrone(
        source.replace(
          "drone.turn_right()\ndrone.forward(1)",
          "drone.forward(1)\ndrone.turn_right()",
        ),
        mission,
      ).success,
    ).toBe(false);
  });
});
