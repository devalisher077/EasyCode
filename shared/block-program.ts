/** Only whitelisted educational blocks cross the trust boundary. Never deserialize
 * arbitrary Blockly plugins, mutations, variables or HTML from submitted JSON. */
type Block = {
  type: string;
  fields?: Record<string, number | string>;
  x?: number;
  y?: number;
  disabledReasons?: string[];
  inputs?: Record<string, { block: Block }>;
  next?: { block: Block };
};
const robotTypes = [
  "easy_forward",
  "easy_backward",
  "easy_left",
  "easy_right",
  "easy_stop",
  "easy_repeat",
  "easy_if",
];
const circuitTypes = [
  "circuit_led",
  "circuit_wait",
  "circuit_repeat",
  "circuit_if",
];
export function blockProgram(value: unknown, variant: "robot" | "electronics") {
  const fail = (): never => {
    throw new Error("Некорректная или слишком сложная блочная программа.");
  };
  if (
    !value ||
    typeof value !== "object" ||
    JSON.stringify(value).length > 48000
  )
    return fail();
  const raw = value as { blocks?: { blocks?: unknown[] } };
  if (!raw.blocks && Object.keys(raw).length === 0) raw.blocks = { blocks: [] };
  if (!raw.blocks || !Array.isArray(raw.blocks.blocks)) return fail();
  let count = 0;
  function clean(input: unknown, depth = 0): Block {
    if (!input || typeof input !== "object" || ++count > 120 || depth > 30)
      return fail();
    const b = input as Record<string, any>;
    if (!(variant === "robot" ? robotTypes : circuitTypes).includes(b.type))
      return fail();
    const result: Block = { type: b.type };
    for (const axis of ["x", "y"] as const)
      if (typeof b[axis] === "number" && Number.isFinite(b[axis]))
        result[axis] = Math.max(-10000, Math.min(10000, b[axis]));
    if (b.disabledReasons?.length || b.enabled === false)
      result.disabledReasons = ["MANUALLY_DISABLED"];
    if (
      [
        "easy_forward",
        "easy_backward",
        "easy_repeat",
        "circuit_repeat",
      ].includes(b.type)
    ) {
      const n = b.fields?.COUNT;
      if (
        !Number.isInteger(n) ||
        n < (b.type === "circuit_repeat" ? 1 : 0) ||
        n > (b.type === "circuit_repeat" ? 20 : 100)
      )
        return fail();
      result.fields = { COUNT: n };
    }
    if (b.type === "circuit_wait") {
      const n = b.fields?.MS;
      if (!Number.isInteger(n) || n < 10 || n > 2000) return fail();
      result.fields = { MS: n };
    }
    if (b.type === "circuit_led") {
      if (!["on", "off"].includes(b.fields?.STATE)) return fail();
      result.fields = { STATE: b.fields.STATE };
    }
    if (b.type === "circuit_if") {
      if (!["button.pressed", "sensor.dark"].includes(b.fields?.INPUT))
        return fail();
      result.fields = { INPUT: b.fields.INPUT };
    }
    const allowedInputs = b.type.endsWith("_if")
      ? ["BODY", "ELSE"]
      : b.type.endsWith("_repeat")
        ? ["BODY"]
        : [];
    if (b.inputs) {
      result.inputs = {};
      for (const name of Object.keys(b.inputs)) {
        if (!allowedInputs.includes(name) || !b.inputs[name]?.block)
          return fail();
        result.inputs[name] = { block: clean(b.inputs[name].block, depth + 1) };
      }
    }
    if (b.next) result.next = { block: clean(b.next.block, depth) };
    return result;
  }
  const blocks = raw.blocks.blocks.map((b) => clean(b));
  function chain(first?: Block, indent = 0): string {
    if (indent > 8) return fail();
    const lines: string[] = [];
    for (let b = first; b; b = b.next?.block) {
      if (b.disabledReasons?.length) continue;
      const pad = "    ".repeat(indent);
      const body = (name: string) =>
        chain(b!.inputs?.[name]?.block, indent + 1) || `${pad}    pass\n`;
      const n = b.fields?.COUNT;
      const simple: Record<string, string> = {
        easy_forward: `robot.forward(${n})`,
        easy_backward: `robot.backward(${n})`,
        easy_left: "robot.turn_left()",
        easy_right: "robot.turn_right()",
        easy_stop: "robot.stop()",
        circuit_led: `led.${b.fields?.STATE}()`,
        circuit_wait: `wait(${b.fields?.MS})`,
      };
      if (simple[b.type]) lines.push(`${pad}${simple[b.type]}\n`);
      else if (b.type.endsWith("_repeat"))
        lines.push(`${pad}for i in range(${n}):\n${body("BODY")}`);
      else
        lines.push(
          `${pad}if ${b.type === "easy_if" ? "robot.obstacle_ahead" : b.fields?.INPUT}():\n${body("BODY")}${pad}else:\n${body("ELSE")}`,
        );
    }
    return lines.join("");
  }
  // Stable execution order, shared by the editor and the trusted evaluator.
  blocks.sort(
    (a, b) => (a.y || 0) + (a.x || 0) / 100 - ((b.y || 0) + (b.x || 0) / 100),
  );
  return {
    state: { blocks: { languageVersion: 0, blocks } },
    code: blocks.map((b) => chain(b)).join("\n"),
  };
}
