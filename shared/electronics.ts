/** Educational logic simulator, not an analogue/SPICE or Arduino emulator. */
export type PartKind = "controller" | "resistor" | "led" | "button" | "sensor";
export type Part = { kind: PartKind; x: number; y: number };
export type Wire = { from: string; to: string };
export type Circuit = { parts: Part[]; wires: Wire[] };
export type Inputs = { pressed: boolean; light: number };
export type ElectronicsFrame = { on: boolean; delay: number; command: string };
export type Exercise = "blink" | "button" | "night";
export const PARTS = {
  controller: {
    title: "Плата EasyBoard",
    subtitle: "5 В · цифровые и аналоговый входы",
    pins: ["5V", "GND", "D9", "D2", "A0"],
  },
  resistor: {
    title: "Резистор",
    subtitle: "220 Ом · защита светодиода",
    pins: ["1", "2"],
  },
  led: {
    title: "Светодиод",
    subtitle: "A — анод (+), K — катод (−)",
    pins: ["A", "K"],
  },
  button: {
    title: "Кнопка",
    subtitle: "Нажатие замыкает контакты",
    pins: ["1", "2"],
  },
  sensor: {
    title: "Датчик света",
    subtitle: "Учебный модуль · 0–100%",
    pins: ["VCC", "GND", "OUT"],
  },
} as const;
export const EXERCISES: Record<
  Exercise,
  { title: string; goal: string; example: string }
> = {
  blink: {
    title: "Мигающий светодиод",
    goal: "Включите и выключите светодиод три раза, с паузой не менее 200 мс в каждом состоянии.",
    example:
      "for i in range(3):\n    led.on()\n    wait(500)\n    led.off()\n    wait(500)\n",
  },
  button: {
    title: "Свет по кнопке",
    goal: "Светодиод должен гореть только при нажатой кнопке. Используйте условие и ветку иначе.",
    example:
      "if button.pressed():\n    led.on()\nelse:\n    led.off()\nwait(100)\n",
  },
  night: {
    title: "Автоматический ночник",
    goal: "При освещённости ниже 40% включайте светодиод, при 40% и выше — выключайте.",
    example:
      "if sensor.dark():\n    led.on()\nelse:\n    led.off()\nwait(100)\n",
  },
};
export const STARTER_CODE = "led.on()\nwait(500)\n";
const validPin = (pin: string) =>
  Object.entries(PARTS).some(([kind, part]) =>
    part.pins.some((p) => `${kind}.${p}` === pin),
  );

export function starterCircuit(exercise: Exercise = "blink"): Circuit {
  const parts: Part[] = [
    { kind: "controller", x: 40, y: 40 },
    { kind: "resistor", x: 300, y: 40 },
    { kind: "led", x: 560, y: 40 },
  ];
  const wires: Wire[] = [
    { from: "controller.D9", to: "resistor.1" },
    { from: "resistor.2", to: "led.A" },
    { from: "led.K", to: "controller.GND" },
  ];
  if (exercise === "button") {
    parts.push({ kind: "button", x: 300, y: 290 });
    wires.push(
      { from: "controller.5V", to: "button.1" },
      { from: "button.2", to: "controller.D2" },
    );
  }
  if (exercise === "night") {
    parts.push({ kind: "sensor", x: 560, y: 290 });
    wires.push(
      { from: "controller.5V", to: "sensor.VCC" },
      { from: "controller.GND", to: "sensor.GND" },
      { from: "sensor.OUT", to: "controller.A0" },
    );
  }
  return { parts, wires };
}

export function validateCircuit(value: unknown): value is Circuit {
  if (!value || typeof value !== "object") return false;
  const c = value as Circuit;
  if (
    !Array.isArray(c.parts) ||
    !Array.isArray(c.wires) ||
    c.parts.length > 5 ||
    c.wires.length > 24
  )
    return false;
  if (
    !c.parts.every(
      (p) =>
        p &&
        Object.hasOwn(PARTS, p.kind) &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= 0 &&
        p.x <= 620 &&
        p.y >= 0 &&
        p.y <= 370,
    )
  )
    return false;
  if (new Set(c.parts.map((p) => p.kind)).size !== c.parts.length) return false;
  const has = (pin: string) =>
    c.parts.some((p) => pin.startsWith(`${p.kind}.`));
  return c.wires.every(
    (w) =>
      w &&
      typeof w.from === "string" &&
      typeof w.to === "string" &&
      w.from !== w.to &&
      validPin(w.from) &&
      validPin(w.to) &&
      has(w.from) &&
      has(w.to),
  );
}

/** Wires are ideal conductors; only the supported series-LED topology is simulated.
 * D2 has a virtual internal pull-down. The light sensor is an ideal powered module. */
export function inspectCircuit(circuit: Circuit, inputs: Inputs) {
  const errors: string[] = [];
  const has = (kind: PartKind) => circuit.parts.some((p) => p.kind === kind);
  if (!validateCircuit(circuit))
    return {
      errors: ["Некорректная схема."],
      ledReady: false,
      buttonReady: false,
      sensorReady: false,
    };
  const parent = new Map<string, string>();
  const root = (pin: string): string => {
    let current = pin;
    while (parent.has(current)) current = parent.get(current)!;
    return current;
  };
  const union = (a: string, b: string) => {
    const ra = root(a),
      rb = root(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const wire of circuit.wires) union(wire.from, wire.to);
  const buttonWired =
    has("controller") &&
    has("button") &&
    root("controller.D2") !== root("controller.5V") &&
    root("controller.D2") !== root("controller.GND") &&
    root("controller.D2") !== root("controller.D9") &&
    ((root("button.1") === root("controller.5V") &&
      root("button.2") === root("controller.D2")) ||
      (root("button.2") === root("controller.5V") &&
        root("button.1") === root("controller.D2")));
  if (has("button") && inputs.pressed) union("button.1", "button.2");
  const same = (a: string, b: string) => root(a) === root(b);
  if (!has("controller")) errors.push("Добавьте плату EasyBoard.");
  if (["5V", "D9"].some((pin) => same(`controller.${pin}`, "controller.GND")))
    errors.push(
      "Короткое замыкание: выход или питание соединены с GND. Удалите лишний провод.",
    );
  if (same("controller.5V", "controller.D9"))
    errors.push("Не соединяйте выход D9 с питанием 5V.");
  if (same("led.A", "led.K") && has("led"))
    errors.push("Контакты светодиода замкнуты между собой.");
  if (same("controller.D9", "led.A") && has("led"))
    errors.push("Между D9 и анодом A нужен резистор 220 Ом.");
  if (
    has("led") &&
    (same("led.A", "controller.5V") || same("led.A", "controller.GND"))
  )
    errors.push(
      "Анод A должен получать сигнал D9 через резистор, а не напрямую от питания или GND.",
    );
  const series =
    has("resistor") &&
    !same("resistor.1", "resistor.2") &&
    ((same("controller.D9", "resistor.1") && same("resistor.2", "led.A")) ||
      (same("controller.D9", "resistor.2") && same("resistor.1", "led.A")));
  const ledReady =
    has("controller") &&
    has("led") &&
    series &&
    same("led.K", "controller.GND");
  if (!ledReady)
    errors.push("Соберите цепь: D9 → резистор → A светодиода; K → GND.");
  const buttonReady = buttonWired;
  const sensorReady =
    has("controller") &&
    has("sensor") &&
    same("sensor.VCC", "controller.5V") &&
    same("sensor.GND", "controller.GND") &&
    same("sensor.OUT", "controller.A0") &&
    !same("sensor.OUT", "sensor.VCC") &&
    !same("sensor.OUT", "sensor.GND");
  return { errors, ledReady, buttonReady, sensorReady };
}

type Node =
  | { kind: "on" | "off" | "pass"; line: number }
  | { kind: "wait"; ms: number; line: number }
  | { kind: "repeat"; count: number; body: Node[]; line: number }
  | {
      kind: "if";
      input: "button" | "sensor";
      body: Node[];
      otherwise: Node[];
      line: number;
    };

export function parseElectronics(source: string): Node[] {
  if (source.length > 12000)
    throw new Error("Максимум 12 000 символов в программе.");
  const raw = source.replace(/\r\n?/g, "\n").split("\n");
  if (raw.length > 300) throw new Error("Максимум 300 строк в программе.");
  const lines = raw.flatMap((line, index) => {
    if (line.includes("\t"))
      throw new Error(
        `Строка ${index + 1}: используйте пробелы вместо табуляции.`,
      );
    const text = line.split("#")[0].trimEnd();
    return text.trim()
      ? [
          {
            text: text.trim(),
            indent: text.length - text.trimStart().length,
            line: index + 1,
          },
        ]
      : [];
  });
  if (!lines.length) throw new Error("Добавьте команды для светодиода.");
  let cursor = 0;
  function body(indent: number, depth: number): Node[] {
    if (depth > 6) throw new Error("Допустимо не более 6 вложенных блоков.");
    const nodes: Node[] = [];
    while (cursor < lines.length && lines[cursor].indent >= indent) {
      const item = lines[cursor];
      const fail = (message: string): never => {
        throw new Error(`Строка ${item.line}: ${message}`);
      };
      if (item.indent !== indent) fail("неожиданный отступ.");
      if (item.text === "else:") break;
      cursor++;
      const led = /^led\.(on|off)\(\)$/.exec(item.text);
      const wait = /^wait\((\d+)\)$/.exec(item.text);
      const repeat = /^for [a-zA-Z_]\w* in range\((\d+)\):$/.exec(item.text);
      const condition = /^if (button\.pressed|sensor\.dark)\(\):$/.exec(
        item.text,
      );
      if (led) nodes.push({ kind: led[1] as "on" | "off", line: item.line });
      else if (item.text === "pass")
        nodes.push({ kind: "pass", line: item.line });
      else if (wait) {
        const ms = Number(wait[1]);
        if (ms < 10 || ms > 2000) fail("пауза должна быть от 10 до 2000 мс.");
        nodes.push({ kind: "wait", ms, line: item.line });
      } else if (repeat || condition) {
        if (!lines[cursor] || lines[cursor].indent !== indent + 4)
          fail("внутри блока нужен отступ из 4 пробелов.");
        const nested = body(indent + 4, depth + 1);
        if (!nested.length) fail("пустой блок команд.");
        if (repeat) {
          const count = Number(repeat[1]);
          if (count < 1 || count > 20) fail("число повторений — от 1 до 20.");
          nodes.push({ kind: "repeat", count, body: nested, line: item.line });
        } else {
          let otherwise: Node[] = [];
          if (
            lines[cursor]?.indent === indent &&
            lines[cursor]?.text === "else:"
          ) {
            cursor++;
            if (!lines[cursor] || lines[cursor].indent !== indent + 4)
              fail("после else нужен блок с отступом.");
            otherwise = body(indent + 4, depth + 1);
            if (!otherwise.length) fail("пустой блок else.");
          }
          nodes.push({
            kind: "if",
            input: condition![1].startsWith("button") ? "button" : "sensor",
            body: nested,
            otherwise,
            line: item.line,
          });
        }
      } else fail("неизвестная команда. Откройте справочник команд.");
    }
    return nodes;
  }
  const result = body(0, 0);
  if (cursor !== lines.length)
    throw new Error(
      `Строка ${lines[cursor].line}: else должен следовать за if.`,
    );
  return result;
}

export function evaluateElectronics(
  source: string,
  circuit: Circuit,
  inputs: Inputs,
) {
  const program = parseElectronics(source);
  const checked = inspectCircuit(circuit, inputs);
  if (checked.errors.length) throw new Error(checked.errors[0]);
  const frames: ElectronicsFrame[] = [];
  let on = false,
    count = 0,
    duration = 0;
  function run(nodes: Node[]) {
    for (const node of nodes) {
      if (++count > 500)
        throw new Error(
          "Слишком много действий: сократите циклы (максимум 500).",
        );
      if (node.kind === "repeat")
        for (let i = 0; i < node.count; i++) run(node.body);
      else if (node.kind === "if") {
        if (node.input === "button" && !checked.buttonReady)
          throw new Error("Подключите кнопку между 5V и D2.");
        if (node.input === "sensor" && !checked.sensorReady)
          throw new Error("Подключите датчик: VCC → 5V, GND → GND, OUT → A0.");
        run(
          (node.input === "button" ? inputs.pressed : inputs.light < 40)
            ? node.body
            : node.otherwise,
        );
      } else if (node.kind !== "pass") {
        if (node.kind === "on") on = true;
        if (node.kind === "off") on = false;
        const delay = node.kind === "wait" ? node.ms : 0;
        duration += delay;
        if (duration > 20000)
          throw new Error(
            "Один проход программы должен длиться не более 20 секунд.",
          );
        frames.push({
          on,
          delay,
          command: `Строка ${node.line}: ${node.kind === "wait" ? `wait(${delay})` : `led.${node.kind}()`}`,
        });
      }
    }
  }
  run(program);
  if (!frames.length)
    throw new Error(
      "Программа не управляет светодиодом в этом состоянии входов.",
    );
  return { frames, on, duration };
}

/** Deterministic exercise check. The API reruns it on submitted inputs; this
 * pass/fail result is separate from the teacher's manual section grade. */
export function checkElectronics(
  source: string,
  circuit: Circuit,
  exercise: Exercise,
): { success: boolean; message: string } {
  try {
    if (exercise === "blink") {
      const { frames } = evaluateElectronics(source, circuit, {
        pressed: false,
        light: 70,
      });
      const states: { on: boolean; duration: number }[] = [];
      for (const frame of frames) {
        if (states.at(-1)?.on !== frame.on)
          states.push({ on: frame.on, duration: 0 });
        states.at(-1)!.duration += frame.delay;
      }
      const pairs = states.filter(
        (state, i) =>
          state.on &&
          state.duration >= 200 &&
          states[i + 1]?.on === false &&
          states[i + 1].duration >= 200,
      ).length;
      if (pairs < 3)
        throw new Error(
          "Нужно три включения и выключения, с паузой от 200 мс в каждом состоянии.",
        );
    } else {
      const tests =
        exercise === "button"
          ? [
              { pressed: false, light: 10, expected: false },
              { pressed: true, light: 70, expected: true },
              { pressed: false, light: 70, expected: false },
            ]
          : [0, 20, 39, 40, 70, 100].map((light) => ({
              pressed: false,
              light,
              expected: light < 40,
            }));
      for (const test of tests) {
        const result = evaluateElectronics(source, circuit, test);
        if (
          result.on !== test.expected ||
          result.frames.some((f) => f.on !== test.expected)
        )
          throw new Error(
            exercise === "button"
              ? "Свет должен гореть только при нажатой кнопке. Проверьте обе ветки условия."
              : "Ночник должен включаться только при освещённости ниже 40%. Проверьте порог и else.",
          );
      }
    }
    return {
      success: true,
      message:
        "Задание выполнено: схема и программа прошли локальную самопроверку.",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Не удалось проверить схему.",
    };
  }
}
