/** Discrete educational flight model. No eval, hardware access or real flight physics. */
export type DronePoint = { x: number; y: number; z: number };
export type DroneFrame = DronePoint & {
  heading: number;
  battery: number;
  carrying: boolean;
  delivered: boolean;
  visited: number[];
  command: string;
  line: number;
};
export type DroneMission = {
  id: string;
  title: string;
  description: string;
  start: DronePoint;
  finish: DronePoint;
  obstacles: { x: number; z: number; height: number }[];
  checkpoints: DronePoint[];
  cargo?: DronePoint;
};
export const droneMissions: DroneMission[] = [
  {
    id: "first-flight",
    title: "Первый полёт",
    description:
      "Взлетите, пролетите 4 клетки вперёд и приземлитесь на синей площадке.",
    start: { x: 1, y: 0, z: 1 },
    finish: { x: 5, y: 0, z: 1 },
    obstacles: [{ x: 2, z: 5, height: 2 }],
    checkpoints: [],
  },
  {
    id: "checkpoints",
    title: "Воздушный маршрут",
    description:
      "Пройдите оба кольца на высоте 2 и приземлитесь на синей площадке. Над стеной нужно пролететь выше её верхнего края.",
    start: { x: 1, y: 0, z: 1 },
    finish: { x: 5, y: 0, z: 5 },
    obstacles: [
      { x: 3, z: 1, height: 1 },
      { x: 3, z: 2, height: 2 },
      { x: 3, z: 3, height: 2 },
    ],
    checkpoints: [
      { x: 5, y: 2, z: 1 },
      { x: 5, y: 2, z: 5 },
    ],
  },
  {
    id: "delivery",
    title: "Дрон-доставщик",
    description:
      "Приземлитесь у оранжевого груза, заберите его, доставьте на синюю площадку и выгрузите после посадки.",
    start: { x: 1, y: 0, z: 1 },
    finish: { x: 5, y: 0, z: 5 },
    cargo: { x: 5, y: 0, z: 1 },
    obstacles: [
      { x: 5, z: 3, height: 2 },
      { x: 3, z: 3, height: 1 },
    ],
    checkpoints: [],
  },
];
export const droneStarter = "drone.takeoff()\ndrone.forward(1)\n";
export const droneBlocks = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "drone_takeoff",
        x: 30,
        y: 40,
        next: { block: { type: "drone_forward", fields: { COUNT: 1 } } },
      },
    ],
  },
};
export const initialDrone = (mission: DroneMission): DroneFrame => ({
  ...mission.start,
  heading: 0,
  battery: 100,
  carrying: false,
  delivered: false,
  visited: [],
  command: "",
  line: 0,
});
type Node = { command: string; count: number; line: number; body?: Node[] };
export type DroneResult = {
  frames: DroneFrame[];
  success: boolean;
  message: string;
  errorLine?: number;
};
const same = (a: DronePoint, b: DronePoint) =>
  a.x === b.x && a.y === b.y && a.z === b.z;

export function evaluateDrone(
  source: string,
  mission: DroneMission,
): DroneResult {
  const frames = [initialDrone(mission)];
  let activeLine = 0;
  try {
    if (source.length > 12000)
      throw new Error("Программа дрона слишком длинная.");
    const lines = source
      .split(/\r?\n/)
      .map((raw, i) => ({
        text: raw.replace(/#.*/, "").trim(),
        indent: raw.length - raw.trimStart().length,
        raw,
        line: i + 1,
      }))
      .filter((l) => l.text);
    let cursor = 0;
    function parse(indent = 0): Node[] {
      if (indent > 24) throw new Error("Программа дрона слишком длинная.");
      const nodes: Node[] = [];
      while (cursor < lines.length) {
        const l = lines[cursor];
        activeLine = l.line;
        if (l.indent % 4 || l.raw.includes("\t"))
          throw new Error("Используйте отступы по 4 пробела.");
        if (l.indent < indent) break;
        if (l.indent !== indent || l.raw.includes("\t"))
          throw new Error("Используйте отступы по 4 пробела.");
        cursor++;
        const loop = /^for [a-zA-Z_]\w* in range\((\d+)\):$/.exec(l.text);
        if (loop) {
          const count = Number(loop[1]);
          if (count < 1 || count > 20)
            throw new Error("Повторение: от 1 до 20 раз.");
          const body = parse(indent + 4);
          if (!body.length) throw new Error("Внутри цикла нужны команды.");
          nodes.push({ command: "repeat", count, line: l.line, body });
          continue;
        }
        if (l.text === "pass") {
          nodes.push({ command: "pass", count: 1, line: l.line });
          continue;
        }
        const match =
          /^drone\.(takeoff|land|forward|up|down|turn_left|turn_right|pickup|drop)\((\d*)\)$/.exec(
            l.text,
          );
        if (!match)
          throw new Error(
            "Неизвестная команда дрона. Откройте справочник команд.",
          );
        const needsCount = ["forward", "up", "down"].includes(match[1]);
        const count = Number(match[2]);
        if (needsCount ? !match[2] || count < 1 || count > 8 : !!match[2])
          throw new Error(
            "У движения должно быть число от 1 до 8; остальные команды — без аргументов.",
          );
        nodes.push({
          command: match[1],
          count: needsCount ? count : 1,
          line: l.line,
        });
      }
      return nodes;
    }
    const program = parse();
    let operations = 0;
    function execute(nodes: Node[]) {
      for (const node of nodes) {
        activeLine = node.line;
        if (++operations > 250) throw new Error("Превышен лимит команд дрона.");
        if (node.body) {
          for (let i = 0; i < node.count; i++) execute(node.body);
          continue;
        }
        if (node.command === "pass") continue;
        const previous = frames.at(-1)!;
        const repeats = node.command === "land" ? previous.y : node.count;
        if (node.command === "land" && !previous.y)
          throw new Error("Дрон уже на земле.");
        for (let i = 0; i < repeats; i++) {
          if (++operations > 250)
            throw new Error("Превышен лимит команд дрона.");
          const f = {
            ...frames.at(-1)!,
            visited: [...frames.at(-1)!.visited],
            command: `drone.${node.command}(${["forward", "up", "down"].includes(node.command) ? node.count : ""})`,
            line: node.line,
          };
          if (f.battery < 2)
            throw new Error("Заряд закончился. Сократите маршрут.");
          if (node.command === "takeoff") {
            if (f.y !== 0) throw new Error("Дрон уже в воздухе.");
            f.y = 1;
          } else if (["forward", "up", "down"].includes(node.command)) {
            if (!f.y) throw new Error("Сначала выполните взлёт.");
            if (node.command === "up") f.y++;
            if (node.command === "down") {
              if (f.y === 1)
                throw new Error("Для посадки используйте drone.land().");
              f.y--;
            }
            if (node.command === "forward") {
              f.x += [1, 0, -1, 0][f.heading];
              f.z += [0, 1, 0, -1][f.heading];
            }
          } else if (node.command === "land") f.y--;
          else if (node.command === "turn_left")
            f.heading = (f.heading + 3) % 4;
          else if (node.command === "turn_right")
            f.heading = (f.heading + 1) % 4;
          else if (node.command === "pickup") {
            if (
              !mission.cargo ||
              !same(f, mission.cargo) ||
              f.carrying ||
              f.delivered
            )
              throw new Error(
                "Забрать груз можно только после посадки на оранжевой площадке.",
              );
            f.carrying = true;
          } else if (node.command === "drop") {
            if (!f.carrying || !same(f, mission.finish))
              throw new Error(
                "Выгрузите груз после посадки на синей площадке.",
              );
            f.carrying = false;
            f.delivered = true;
          }
          if (f.x < 0 || f.x > 7 || f.z < 0 || f.z > 7 || f.y > 5)
            throw new Error("Выход за границы: поле 8 × 8, высота до 5.");
          if (
            mission.obstacles.some(
              (o) => o.x === f.x && o.z === f.z && f.y <= o.height,
            )
          )
            throw new Error(
              "Столкновение. Измените маршрут или увеличьте высоту.",
            );
          mission.checkpoints.forEach((p, n) => {
            if (same(f, p) && !f.visited.includes(n)) f.visited.push(n);
          });
          f.battery -= 2;
          frames.push(f);
        }
      }
    }
    execute(program);
    const last = frames.at(-1)!;
    const success =
      frames.length > 1 &&
      same(last, mission.finish) &&
      last.visited.length === mission.checkpoints.length &&
      (!mission.cargo || last.delivered);
    return {
      frames,
      success,
      message: success
        ? "Миссия выполнена. Посадка подтверждена."
        : "Полёт завершён. Выполните все условия и приземлитесь на синей площадке.",
    };
  } catch (error) {
    return {
      frames,
      success: false,
      message:
        error instanceof Error ? error.message : "Ошибка программы дрона.",
      errorLine: activeLine,
    };
  }
}
