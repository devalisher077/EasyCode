import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORLD,
  evaluateCode,
  parseProgram,
  runProgram,
  type Program,
  type World,
} from "./simulator";

const solution = "robot.forward(5)\nrobot.turn_left()\nrobot.forward(3)";

describe("safe teaching Python parser and simulator", () => {
  it("reaches the goal and records each movement and turn", () => {
    const result = evaluateCode(solution);
    expect(result.success).toBe(true);
    expect(result.steps).toBe(8);
    expect(result.frames).toHaveLength(10);
    expect(result.frames.at(-1)).toMatchObject({
      x: 6,
      y: 1,
      direction: "north",
    });
  });
  it("reports unfinished work without claiming success", () => {
    expect(evaluateCode("robot.forward(2)").success).toBe(false);
  });
  it("blocks boundaries and records only safe frames", () => {
    const result = evaluateCode("robot.forward(100)");
    expect(result.success).toBe(false);
    expect(result.steps).toBe(6);
    expect(result.frames.at(-1)?.x).toBe(7);
    expect(result.message).toContain("Путь закрыт");
  });
  it("blocks obstacles", () => {
    const result = evaluateCode(
      "robot.forward(3)\nrobot.turn_left()\nrobot.forward(1)",
    );
    expect(result.success).toBe(false);
    expect(result.frames.at(-1)).toMatchObject({ x: 4, y: 4 });
    expect(result.message).toContain("Путь закрыт");
  });
  it("supports loops, comments and CRLF", () => {
    expect(
      evaluateCode(
        "# Начало\r\nfor i in range(5):\r\n    robot.forward(1) # шаг\r\nrobot.turn_left()\r\nfor j in range(3):\r\n    robot.forward(1)",
      ).success,
    ).toBe(true);
  });
  it("supports nested loops and zero repetitions", () => {
    const result = evaluateCode(
      "for i in range(0):\n    robot.forward(100)\nfor i in range(2):\n    for j in range(2):\n        robot.turn_left()",
    );
    expect(result.frames.at(-1)?.direction).toBe("east");
    expect(result.frames).toHaveLength(5);
  });
  it("supports obstacle conditions with else", () => {
    const result = evaluateCode(
      "robot.forward(3)\nrobot.turn_left()\nif robot.obstacle_ahead():\n    robot.turn_right()\nelse:\n    robot.forward(1)",
    );
    expect(result.frames.at(-1)).toMatchObject({
      x: 4,
      y: 4,
      direction: "east",
    });
    const alternative = evaluateCode(
      "if robot.obstacle_ahead():\n    robot.stop()\nelse:\n    robot.forward(2)",
    );
    expect(alternative.steps).toBe(2);
  });
  it("treats the field edge as an obstacle ahead", () => {
    const result = evaluateCode(
      "robot.forward(6)\nif robot.obstacle_ahead():\n    robot.turn_left()",
    );
    expect(result.frames.at(-1)?.direction).toBe("north");
  });
  it("executes backward and stops the whole program from a nested loop", () => {
    const result = evaluateCode(
      "robot.backward(1)\nfor i in range(3):\n    robot.stop()\nrobot.forward(2)",
    );
    expect(result.steps).toBe(1);
    expect(result.frames.at(-1)?.x).toBe(0);
  });
  it.each([
    "",
    'print("hello")',
    "import os",
    "robot.__class__",
    "robot.forward(-1)",
    "robot.forward(1.5)",
    "robot.forward(101)",
    "robot.forward(Infinity)",
    "robot.forward(1); robot.stop()",
    "for i in range(1000000000):\n    pass",
    "while True:\n    pass",
    "    robot.forward(1)",
    "robot.forward(1)\n    robot.stop()",
    "for i in range(2):\nrobot.stop()",
    "else:\n    pass",
    "for i in range(2):\n    else:\n        pass",
    "for i in range(2):\n\trobot.stop()",
    "if robot.obstacle_ahead():\n    pass\nelse:",
  ])("rejects malformed or arbitrary code %s", (source) => {
    expect(() => parseProgram(source)).toThrow();
    expect(evaluateCode(source).success).toBe(false);
  });
  it("bounds nested work even when it contains no movement", () => {
    const result = evaluateCode(
      "for i in range(100):\n    for j in range(100):\n        pass",
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("Слишком много действий");
  });
  it("rejects too much nesting and source size", () => {
    const deep =
      Array.from(
        { length: 10 },
        (_, index) => `${" ".repeat(index * 4)}for i in range(2):`,
      ).join("\n") +
      "\n" +
      " ".repeat(40) +
      "pass";
    expect(() => parseProgram(deep)).toThrow(/вложенных/);
    expect(() => parseProgram("#".repeat(20_001))).toThrow();
    expect(() => parseProgram("\n".repeat(401))).toThrow();
  });
  it("rejects invalid external AST instead of running it", () => {
    const invalid = {
      statements: [{ kind: "repeat", count: Infinity, body: [] }],
    } as Program;
    expect(runProgram(invalid, DEFAULT_WORLD).success).toBe(false);
    const cyclic: Program = { statements: [] };
    cyclic.statements.push({
      kind: "repeat",
      count: 1,
      body: cyclic.statements,
    });
    expect(runProgram(cyclic, DEFAULT_WORLD).success).toBe(false);
  });
  it("validates externally supplied worlds", () => {
    const bad = { ...DEFAULT_WORLD, width: 1 };
    expect(evaluateCode(solution, bad).message).toContain("Поле");
    expect(
      evaluateCode(solution, {
        ...DEFAULT_WORLD,
        obstacles: [DEFAULT_WORLD.start],
      }).success,
    ).toBe(false);
    expect(evaluateCode(solution, null as unknown as World).success).toBe(
      false,
    );
  });
  it("does not mutate the original world", () => {
    const before = JSON.stringify(DEFAULT_WORLD);
    evaluateCode(solution);
    expect(JSON.stringify(DEFAULT_WORLD)).toBe(before);
  });
});
