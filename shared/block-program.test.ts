import { describe, expect, it } from "vitest";
import { blockProgram } from "./block-program";
const state = (blocks: object[]) => ({
  blocks: { languageVersion: 0, blocks },
});
describe("safe block snapshots", () => {
  it("compiles nested loops and branches and strips arbitrary metadata", () => {
    const parsed = blockProgram(
      state([
        {
          type: "easy_repeat",
          fields: { COUNT: 2 },
          extraState: { dangerous: true },
          inputs: {
            BODY: {
              block: {
                type: "easy_if",
                inputs: { BODY: { block: { type: "easy_left" } } },
              },
            },
          },
        },
      ]),
      "robot",
    );
    expect(parsed.code).toBe(
      "for i in range(2):\n    if robot.obstacle_ahead():\n        robot.turn_left()\n    else:\n        pass\n",
    );
    expect(JSON.stringify(parsed.state)).not.toContain("dangerous");
  });
  it("preserves disabled blocks without executing them and uses stable stack order", () => {
    const parsed = blockProgram(
      state([
        { type: "easy_stop", y: 100 },
        {
          type: "easy_forward",
          y: 10,
          fields: { COUNT: 3 },
          disabledReasons: ["MANUALLY_DISABLED"],
          next: { block: { type: "easy_left" } },
        },
      ]),
      "robot",
    );
    expect(parsed.code).toBe("robot.turn_left()\n\nrobot.stop()\n");
  });
  it("rejects unknown blocks, unsafe fields, mismatched variants and excessive complexity", () => {
    for (const block of [
      { type: "evil" },
      { type: "easy_forward", fields: { COUNT: "1); evil()" } },
      { type: "circuit_led", fields: { STATE: "on" } },
      {
        type: "easy_left",
        inputs: { script: { block: { type: "easy_stop" } } },
      },
    ])
      expect(() => blockProgram(state([block]), "robot")).toThrow();
    expect(() =>
      blockProgram(
        state(Array.from({ length: 121 }, () => ({ type: "easy_stop" }))),
        "robot",
      ),
    ).toThrow();
    expect(() =>
      blockProgram(
        state([{ type: "circuit_wait", fields: { MS: 9000 } }]),
        "electronics",
      ),
    ).toThrow();
  });
  it("supports an empty workspace and bounds snapshots", () => {
    expect(blockProgram({}, "robot").code).toBe("");
    expect(() => blockProgram({ data: "x".repeat(48001) }, "robot")).toThrow();
  });
});
