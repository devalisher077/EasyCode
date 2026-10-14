import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  courseRobotTasks,
  courseElectronics,
  courseTaskByLesson,
  evaluateCourseTask,
} from "./course-practice";
import { blockProgram } from "./block-program";
import { lessons } from "../content/lessons";
import { translate } from "./i18n";

const solutions: Record<string, string> = {
  "1.1": "robot.forward(3)",
  "1.2": "robot.forward(2)\nrobot.turn_left()\nrobot.forward(2)",
  "2.1":
    "robot.forward(1)\nrobot.turn_left()\nrobot.forward(2)\nrobot.turn_right()\nrobot.forward(2)",
  "2.2": "robot.backward(3)\nrobot.turn_left()\nrobot.forward(1)",
  "3.1": "for i in range(6):\n    robot.forward(1)",
  "3.2":
    "for i in range(4):\n    robot.forward(1)\n    robot.turn_left()\n    robot.forward(1)\n    robot.turn_right()",
  "4.1":
    "if robot.obstacle_ahead():\n    robot.turn_right()\nrobot.forward(1)\nrobot.turn_left()\nrobot.forward(1)",
  "4.2":
    "if robot.obstacle_ahead():\n    robot.turn_right()\n    robot.forward(2)\n    robot.turn_left()\n    robot.forward(2)\nelse:\n    robot.forward(2)\n    robot.turn_right()\n    robot.forward(2)",
  "6.1":
    "for i in range(7):\n    if robot.obstacle_ahead():\n        robot.turn_left()\n    robot.forward(1)",
  "6.2":
    "for i in range(7):\n    if robot.obstacle_ahead():\n        robot.turn_left()\n    robot.forward(1)",
};
describe("topic practice", () => {
  it("covers all 12 lessons and has distinct robot maps and database IDs", () => {
    expect(
      courseRobotTasks.length + Object.keys(courseElectronics).length,
    ).toBe(12);
    expect(
      new Set(courseRobotTasks.map((task) => JSON.stringify(task.world))).size,
    ).toBe(10);
    const sql = readFileSync(
      "supabase/migrations/202610140003_course_practice.sql",
      "utf8",
    );
    for (const task of courseRobotTasks) expect(sql).toContain(`'${task.id}'`);
    for (const lesson of lessons) {
      const task =
        courseTaskByLesson(lesson.id) || courseElectronics[lesson.id];
      expect(lesson.practice.title).toBe(task.title);
      for (const lang of ["en", "kk"] as const) {
        expect(translate(task.title, lang)).not.toBe(task.title);
        expect(translate(task.description, lang)).not.toBe(task.description);
      }
    }
  });
  for (const task of courseRobotTasks)
    it(`validates solution and rejects unfinished starter for ${task.lesson_id}`, () => {
      const result = evaluateCourseTask(solutions[task.lesson_id], task);
      expect(result.success, JSON.stringify(result)).toBe(true);
      expect(result.checks?.every((check) => check.passed)).toBe(true);
      expect(evaluateCourseTask(task.starterCode, task).success).toBe(false);
    });
  it("does not credit comments, empty loops or unexecuted constructs", () => {
    const loop = courseTaskByLesson("3.1")!;
    for (const code of [
      "robot.forward(6)",
      "# for i in range(6):\nrobot.forward(6)",
      "for i in range(0):\n    robot.forward(1)\nrobot.forward(6)",
      "for i in range(6):\n    pass\nrobot.forward(6)",
    ])
      expect(evaluateCourseTask(code, loop).success).toBe(false);
    expect(
      evaluateCourseTask(
        solutions["4.1"].replace("if robot.obstacle_ahead():\n    ", ""),
        courseTaskByLesson("4.1")!,
      ).success,
    ).toBe(false);
  });
  it("checks both maps even when previewing just one", () => {
    const task = courseTaskByLesson("4.2")!;
    const oneMap =
      "robot.turn_right()\nrobot.forward(2)\nrobot.turn_left()\nrobot.forward(2)";
    expect(evaluateCourseTask(oneMap, task).success).toBe(false);
    const second = evaluateCourseTask(solutions["4.2"], task, 1);
    expect(second.success).toBe(true);
    expect(second.frames[1].command).toBe("robot.forward(1)");
  });
  it("provides matching broken code and blocks for debugging", () => {
    const task = courseTaskByLesson("6.2")!;
    expect(blockProgram(task.starterBlocks, "robot").code.trim()).toBe(
      task.starterCode.trim(),
    );
  });
});
