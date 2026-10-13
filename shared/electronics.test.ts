import { describe, expect, it } from "vitest";
import {
  checkElectronics,
  evaluateElectronics,
  EXERCISES,
  inspectCircuit,
  parseElectronics,
  starterCircuit,
  validateCircuit,
  type Exercise,
} from "./electronics";
const inputs = { pressed: false, light: 70 };

describe("electronics circuit model", () => {
  it.each(["blink", "button", "night"] as Exercise[])(
    "accepts the %s starter and validates its example",
    (exercise) => {
      const circuit = starterCircuit(exercise);
      expect(validateCircuit(circuit)).toBe(true);
      expect(inspectCircuit(circuit, inputs).errors).toEqual([]);
      expect(
        checkElectronics(EXERCISES[exercise].example, circuit, exercise)
          .success,
      ).toBe(true);
    },
  );
  it("detects a missing return wire and reversed LED polarity", () => {
    const circuit = starterCircuit();
    circuit.wires.pop();
    expect(inspectCircuit(circuit, inputs).ledReady).toBe(false);
    expect(() => evaluateElectronics("led.on()", circuit, inputs)).toThrow(
      "Соберите цепь",
    );
    circuit.wires = starterCircuit().wires.map((w) => ({
      from: w.from === "led.K" ? "led.A" : w.from,
      to: w.to === "led.A" ? "led.K" : w.to,
    }));
    expect(inspectCircuit(circuit, inputs).ledReady).toBe(false);
  });
  it("detects bypassed resistors and direct supply connections", () => {
    for (const from of ["controller.D9", "controller.5V", "controller.GND"]) {
      const circuit = starterCircuit();
      circuit.wires.push({ from, to: "led.A" });
      expect(inspectCircuit(circuit, inputs).errors.length).toBeGreaterThan(0);
      expect(
        checkElectronics(EXERCISES.blink.example, circuit, "blink").success,
      ).toBe(false);
    }
  });
  it("detects supply and output shorts even through a pressed button", () => {
    for (const from of ["controller.5V", "controller.D9"]) {
      const circuit = starterCircuit();
      circuit.wires.push({ from, to: "controller.GND" });
      expect(inspectCircuit(circuit, inputs).errors.join()).toContain(
        "Короткое замыкание",
      );
    }
    const circuit = starterCircuit("button");
    circuit.wires.push({ from: "button.2", to: "controller.GND" });
    expect(
      inspectCircuit(circuit, { ...inputs, pressed: true }).errors.join(),
    ).toContain("Короткое замыкание");
  });
  it("requires a real button connection, not a wire bypass", () => {
    const circuit = starterCircuit("button");
    circuit.wires.push({ from: "button.1", to: "button.2" });
    expect(inspectCircuit(circuit, inputs).buttonReady).toBe(false);
    expect(
      checkElectronics(EXERCISES.button.example, circuit, "button").success,
    ).toBe(false);
  });
  it("requires all three sensor connections", () => {
    const circuit = starterCircuit("night");
    circuit.wires = circuit.wires.filter((w) => w.to !== "sensor.GND");
    expect(
      checkElectronics(EXERCISES.night.example, circuit, "night").message,
    ).toContain("Подключите датчик");
  });
  it("allows reversing a resistor and button, but not LED", () => {
    const circuit = starterCircuit("button");
    const reverse = (p: string) =>
      /^(resistor|button)\.[12]$/.test(p)
        ? p.slice(0, -1) + (p.endsWith("1") ? "2" : "1")
        : p;
    circuit.wires = circuit.wires.map((w) => ({
      from: reverse(w.from),
      to: reverse(w.to),
    }));
    expect(
      checkElectronics(EXERCISES.button.example, circuit, "button").success,
    ).toBe(true);
  });
  it("rejects unknown pins, duplicate parts and invalid stored positions", () => {
    const circuit = starterCircuit();
    expect(
      validateCircuit({
        ...circuit,
        wires: [{ from: "controller.D9", to: "led.invalid" }],
      }),
    ).toBe(false);
    expect(
      validateCircuit({
        ...circuit,
        parts: [...circuit.parts, circuit.parts[0]],
      }),
    ).toBe(false);
    expect(
      validateCircuit({
        ...circuit,
        parts: [{ kind: "__proto__", x: 0, y: 0 }],
      }),
    ).toBe(false);
    expect(
      validateCircuit({
        ...circuit,
        parts: [{ kind: "led", x: Infinity, y: 0 }],
      }),
    ).toBe(false);
    expect(
      validateCircuit({ ...circuit, parts: [{ kind: "led", x: 0, y: -1 }] }),
    ).toBe(false);
  });
});

describe("bounded electronics language and self-check", () => {
  it("uses input states and the exact 40% light threshold", () => {
    expect(
      evaluateElectronics(EXERCISES.button.example, starterCircuit("button"), {
        ...inputs,
        pressed: true,
      }).on,
    ).toBe(true);
    expect(
      evaluateElectronics(
        EXERCISES.button.example,
        starterCircuit("button"),
        inputs,
      ).on,
    ).toBe(false);
    for (const light of [0, 39, 40, 100])
      expect(
        evaluateElectronics(EXERCISES.night.example, starterCircuit("night"), {
          ...inputs,
          light,
        }).on,
      ).toBe(light < 40);
  });
  it("does not pass always-on programs or fake rapid blinking", () => {
    expect(
      checkElectronics("led.on()", starterCircuit("button"), "button").success,
    ).toBe(false);
    expect(
      checkElectronics("led.on()", starterCircuit("night"), "night").success,
    ).toBe(false);
    expect(
      checkElectronics(
        EXERCISES.blink.example.replaceAll("500", "10"),
        starterCircuit(),
        "blink",
      ).success,
    ).toBe(false);
    expect(
      checkElectronics(
        "for i in range(3):\n    led.on()\n    wait(500)",
        starterCircuit(),
        "blink",
      ).success,
    ).toBe(false);
  });
  it.each([
    "import os",
    "eval('alert(1)')",
    "while True:\n    led.on()",
    "wait(-1)",
    "wait(2001)",
    "for i in range(999999):\n    pass",
    "if button.pressed():\nled.on()",
    "else:\n    led.on()",
    "    led.on()",
    "if sensor.dark():\n\tled.on()",
  ])("rejects unsupported or malformed source: %s", (source) => {
    expect(() => parseElectronics(source)).toThrow();
  });
  it("bounds nested execution, source length, lines and duration", () => {
    expect(() => parseElectronics("#".repeat(12001))).toThrow();
    expect(() => parseElectronics("\n".repeat(301))).toThrow();
    expect(() =>
      evaluateElectronics(
        "for i in range(20):\n    for j in range(20):\n        led.on()\n        led.off()",
        starterCircuit(),
        inputs,
      ),
    ).toThrow("500");
    expect(() =>
      evaluateElectronics(
        "for i in range(20):\n    wait(2000)",
        starterCircuit(),
        inputs,
      ),
    ).toThrow("20 секунд");
    expect(() => evaluateElectronics("pass", starterCircuit(), inputs)).toThrow(
      "не управляет",
    );
  });
});
