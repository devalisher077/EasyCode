import { describe, expect, it } from "vitest";
import { droneMissions, evaluateDrone, droneBlocks } from "./drone";
import { blockProgram } from "./block-program";

const flight = "drone.takeoff()\ndrone.forward(4)\ndrone.land()";
const route =
  "drone.takeoff()\ndrone.up(1)\ndrone.forward(4)\ndrone.turn_right()\ndrone.forward(4)\ndrone.land()";
const delivery =
  "drone.takeoff()\ndrone.forward(4)\ndrone.land()\ndrone.pickup()\ndrone.takeoff()\ndrone.up(2)\ndrone.turn_right()\ndrone.forward(4)\ndrone.land()\ndrone.drop()";
describe("drone educational interpreter", () => {
  it.each([flight, route, delivery])("has a solvable mission: %s", (code) => {
    const index = [flight, route, delivery].indexOf(code);
    const result = evaluateDrone(code, droneMissions[index]);
    expect(result.success).toBe(true);
    expect(result.frames.at(-1)?.y).toBe(0);
    expect(result.frames.at(-1)?.battery).toBeGreaterThan(0);
  });
  it("does not award a mission for an empty, unfinished or airborne program", () => {
    for (const code of [
      "",
      "pass",
      "drone.takeoff()",
      flight.replace("drone.land()", ""),
    ])
      expect(evaluateDrone(code, droneMissions[0]).success).toBe(false);
  });
  it("requires checkpoints and cargo delivery", () => {
    const missed = route.replace("drone.up(1)", "drone.up(2)");
    expect(evaluateDrone(missed, droneMissions[1]).success).toBe(false);
    expect(
      evaluateDrone(delivery.replace("drone.drop()", ""), droneMissions[2])
        .success,
    ).toBe(false);
  });
  it("detects collisions on each intermediate movement and landing step", () => {
    const collision = evaluateDrone(
      "drone.takeoff()\ndrone.forward(4)",
      droneMissions[1],
    );
    expect(collision.message).toContain("Столкновение");
    expect(collision.frames.at(-1)?.x).toBe(2);
    expect(collision.errorLine).toBe(2);
    const landing = evaluateDrone(
      "drone.takeoff()\ndrone.up(2)\ndrone.forward(2)\ndrone.land()",
      droneMissions[1],
    );
    expect(landing.message).toContain("Столкновение");
    expect(landing.frames.at(-1)?.y).toBe(2);
  });
  it.each([
    ["drone.forward(1)", "Сначала"],
    ["drone.takeoff()\ndrone.up(8)", "границы"],
    ["drone.takeoff()\ndrone.forward(8)", "границы"],
    ["drone.pickup()", "оранжевой"],
    ["drone.drop()", "синей"],
    ["drone.takeoff()\ndrone.down(1)", "drone.land"],
    ["drone.takeoff()\ndrone.takeoff()", "уже в воздухе"],
    ["drone.land()", "уже на земле"],
    ["drone.forward(0)", "аргументов"],
    ["drone.land(1)", "аргументов"],
    ["fetch('https://example.com')", "Неизвестная"],
    ["while True:", "Неизвестная"],
    ["for i in range(21):\n    pass", "20"],
    ["for i in range(2):", "Внутри"],
    ["for i in range(2):\n  pass", "4 пробела"],
  ])("rejects unsafe or invalid command %s", (code, text) => {
    const result = evaluateDrone(code, droneMissions[0]);
    expect(result.success).toBe(false);
    expect(result.message).toContain(text);
  });
  it("supports loops and comments without executing arbitrary code", () => {
    const result = evaluateDrone(
      "# take off\ndrone.takeoff()\nfor i in range(4):\n    drone.forward(1) # step\ndrone.land()",
      droneMissions[0],
    );
    expect(result.success).toBe(true);
  });
  it("bounds empty nested loops and battery usage", () => {
    expect(
      evaluateDrone(
        "for i in range(20):\n    for j in range(20):\n        pass",
        droneMissions[0],
      ).message,
    ).toContain("лимит");
    expect(
      evaluateDrone(
        "for i in range(20):\n    for j in range(4):\n        drone.turn_right()",
        droneMissions[0],
      ).message,
    ).toContain("Заряд");
  });
  it("generates and sanitizes drone blocks separately from other environments", () => {
    expect(blockProgram(droneBlocks, "drone").code).toBe(
      "drone.takeoff()\ndrone.forward(1)\n",
    );
    expect(() => blockProgram(droneBlocks, "robot")).toThrow();
    expect(() =>
      blockProgram(
        { blocks: { blocks: [{ type: "drone_up", fields: { COUNT: 100 } }] } },
        "drone",
      ),
    ).toThrow();
    expect(
      blockProgram(
        {
          blocks: {
            blocks: [
              {
                type: "drone_repeat",
                fields: { COUNT: 3 },
                inputs: {
                  BODY: {
                    block: { type: "drone_forward", fields: { COUNT: 1 } },
                  },
                },
              },
            ],
          },
        },
        "drone",
      ).code,
    ).toBe("for i in range(3):\n    drone.forward(1)\n");
  });
});
