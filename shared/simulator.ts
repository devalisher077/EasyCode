export type Direction = "east" | "south" | "west" | "north";
export type Position = { x: number; y: number };
export type World = {
  width: number;
  height: number;
  start: Position & { direction: Direction };
  goal: Position;
  obstacles: Position[];
};

export type Statement =
  | { kind: "move"; direction: "forward" | "backward"; count: number }
  | { kind: "turn"; direction: "left" | "right" }
  | { kind: "stop" | "pass" }
  | { kind: "repeat"; count: number; body: Statement[] }
  | { kind: "if"; body: Statement[]; otherwise: Statement[] };
export type Program = { statements: Statement[] };
export type Frame = Position & { direction: Direction; command: string };
export type RunResult = {
  frames: Frame[];
  success: boolean;
  message: string;
  steps: number;
};

export const DEFAULT_WORLD: World = {
  width: 8,
  height: 6,
  start: { x: 1, y: 4, direction: "east" },
  goal: { x: 6, y: 1 },
  obstacles: [
    { x: 4, y: 3 },
    { x: 3, y: 2 },
  ],
};

export const PROGRAM_LIMITS = {
  sourceLength: 20_000,
  lines: 400,
  nodes: 400,
  nesting: 8,
  count: 100,
  execution: 1_000,
  steps: 500,
} as const;

const directions: Direction[] = ["east", "south", "west", "north"];
const vectors: Record<Direction, Position> = {
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  north: { x: 0, y: -1 },
};
const boundedCount = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= PROGRAM_LIMITS.count;

/** A deliberately small teaching language. No eval, imports, attributes or arbitrary expressions. */
export function parseProgram(source: string): Program {
  if (
    typeof source !== "string" ||
    source.length > PROGRAM_LIMITS.sourceLength
  ) {
    throw new Error("Программа слишком длинная: максимум 20 000 символов.");
  }
  const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
  if (rawLines.length > PROGRAM_LIMITS.lines)
    throw new Error("Максимум 400 строк в программе.");
  const lines = rawLines.flatMap((raw, index) => {
    if (raw.includes("\t"))
      throw new Error(
        `Строка ${index + 1}: используй пробелы вместо табуляции.`,
      );
    const uncommented = raw.split("#", 1)[0].trimEnd();
    if (!uncommented.trim()) return [];
    return [
      {
        indent: uncommented.length - uncommented.trimStart().length,
        text: uncommented.trim(),
        line: index + 1,
      },
    ];
  });
  if (!lines.length) throw new Error("Добавь хотя бы одну команду для машины.");
  if (lines[0].indent !== 0)
    throw new Error("Первая команда должна начинаться без отступа.");
  let cursor = 0;
  let nodes = 0;
  const error = (line: number, message: string): never => {
    throw new Error(`Строка ${line}: ${message}`);
  };
  function parseBody(indent: number, depth: number): Statement[] {
    if (depth > PROGRAM_LIMITS.nesting)
      throw new Error(
        "Слишком много вложенных циклов или условий (максимум 8).",
      );
    const statements: Statement[] = [];
    while (cursor < lines.length) {
      const current = lines[cursor];
      if (current.indent < indent) break;
      if (current.indent > indent) error(current.line, "неожиданный отступ.");
      if (current.text === "else:") break;
      if (++nodes > PROGRAM_LIMITS.nodes)
        error(current.line, "слишком много команд.");
      cursor++;
      const move = current.text.match(
        /^robot\.(forward|backward)\(\s*(\d+)\s*\)$/,
      );
      const turn = current.text.match(/^robot\.turn_(left|right)\(\s*\)$/);
      const repeat = current.text.match(
        /^for [A-Za-z_][A-Za-z_0-9]* in range\(\s*(\d+)\s*\):$/,
      );
      if (move) {
        const count = Number(move[2]);
        if (!boundedCount(count))
          error(current.line, "число шагов должно быть от 0 до 100.");
        statements.push({
          kind: "move",
          direction: move[1] as "forward" | "backward",
          count,
        });
      } else if (turn) {
        statements.push({
          kind: "turn",
          direction: turn[1] as "left" | "right",
        });
      } else if (/^robot\.stop\(\s*\)$/.test(current.text)) {
        statements.push({ kind: "stop" });
      } else if (current.text === "pass") {
        statements.push({ kind: "pass" });
      } else if (repeat || current.text === "if robot.obstacle_ahead():") {
        const next = lines[cursor];
        if (!next || next.indent <= indent)
          error(current.line, "после двоеточия нужен блок с отступом.");
        const body = parseBody(next.indent, depth + 1);
        if (!body.length)
          error(current.line, "блок команд не может быть пустым.");
        if (repeat) {
          const count = Number(repeat[1]);
          if (!boundedCount(count))
            error(current.line, "число повторений должно быть от 0 до 100.");
          statements.push({ kind: "repeat", count, body });
        } else {
          let otherwise: Statement[] = [];
          if (
            lines[cursor]?.indent === indent &&
            lines[cursor]?.text === "else:"
          ) {
            cursor++;
            const branch = lines[cursor];
            if (!branch || branch.indent <= indent)
              error(current.line, "после else нужен блок с отступом.");
            otherwise = parseBody(branch.indent, depth + 1);
            if (!otherwise.length)
              error(current.line, "блок else не может быть пустым.");
          }
          statements.push({ kind: "if", body, otherwise });
        }
      } else {
        error(
          current.line,
          "неизвестная команда. Используй robot.forward(1), повороты, for или if.",
        );
      }
    }
    return statements;
  }
  const statements = parseBody(0, 0);
  if (cursor < lines.length)
    error(
      lines[cursor].line,
      "else должен следовать за if на том же уровне отступа.",
    );
  return { statements };
}

export function validateWorld(value: unknown): asserts value is World {
  const world = value as World;
  if (
    !world ||
    !Number.isInteger(world.width) ||
    !Number.isInteger(world.height) ||
    world.width < 2 ||
    world.height < 2 ||
    world.width > 32 ||
    world.height > 32
  ) {
    throw new Error("Поле должно иметь размер от 2×2 до 32×32.");
  }
  const validPosition = (position: Position) =>
    position &&
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < world.width &&
    position.y < world.height;
  if (
    !validPosition(world.start) ||
    !validPosition(world.goal) ||
    !directions.includes(world.start.direction)
  ) {
    throw new Error("Начало и финиш должны находиться внутри поля.");
  }
  if (
    !Array.isArray(world.obstacles) ||
    world.obstacles.length > 1_024 ||
    !world.obstacles.every(validPosition)
  ) {
    throw new Error("Некорректное расположение препятствий.");
  }
  if (
    world.obstacles.some(
      (p) =>
        (p.x === world.start.x && p.y === world.start.y) ||
        (p.x === world.goal.x && p.y === world.goal.y),
    )
  ) {
    throw new Error("На старте и финише не должно быть препятствий.");
  }
}

function validateProgram(program: Program): void {
  let nodes = 0;
  function visit(statements: Statement[], depth: number): void {
    if (!Array.isArray(statements) || depth > PROGRAM_LIMITS.nesting)
      throw new Error("Некорректная структура программы.");
    for (const statement of statements) {
      if (
        ++nodes > PROGRAM_LIMITS.nodes ||
        !statement ||
        typeof statement !== "object"
      )
        throw new Error("Слишком много команд.");
      switch (statement.kind) {
        case "move":
          if (
            !boundedCount(statement.count) ||
            !["forward", "backward"].includes(statement.direction)
          )
            throw new Error("Некорректная команда движения.");
          break;
        case "turn":
          if (!["left", "right"].includes(statement.direction))
            throw new Error("Некорректный поворот.");
          break;
        case "repeat":
          if (!boundedCount(statement.count))
            throw new Error("Некорректное число повторений.");
          visit(statement.body, depth + 1);
          break;
        case "if":
          visit(statement.body, depth + 1);
          visit(statement.otherwise, depth + 1);
          break;
        case "stop":
        case "pass":
          break;
        default:
          throw new Error("Неизвестная команда.");
      }
    }
  }
  if (
    !program ||
    !Array.isArray(program.statements) ||
    !program.statements.length
  )
    throw new Error("Добавь хотя бы одну команду.");
  visit(program.statements, 0);
}

export type ExecutionEvidence = {
  loopMovement: boolean;
  loopTurn: boolean;
  trueAction: boolean;
  falseAction: boolean;
};
export function runProgram(
  program: Program,
  world: World,
  evidence?: ExecutionEvidence,
): RunResult {
  const frames: Frame[] = [];
  let steps = 0;
  try {
    validateWorld(world);
    validateProgram(program);
    let { x, y, direction } = world.start;
    let stopped = false;
    let operations = 0;
    const obstacles = new Set(world.obstacles.map((p) => `${p.x},${p.y}`));
    const blocked = (px: number, py: number) =>
      px < 0 ||
      py < 0 ||
      px >= world.width ||
      py >= world.height ||
      obstacles.has(`${px},${py}`);
    const tick = () => {
      if (++operations > PROGRAM_LIMITS.execution)
        throw new Error("Слишком много действий. Сократи число повторений.");
    };
    const snapshot = (command: string) => {
      frames.push({ x, y, direction, command });
    };
    const move = (count: number, sign: number, command: string) => {
      for (let index = 0; index < count; index++) {
        tick();
        if (steps >= PROGRAM_LIMITS.steps)
          throw new Error(
            "Лимит — 500 шагов. Попробуй сделать алгоритм короче.",
          );
        const nextX = x + vectors[direction].x * sign;
        const nextY = y + vectors[direction].y * sign;
        if (blocked(nextX, nextY))
          throw new Error(
            "Путь закрыт: машина встретила препятствие или край поля.",
          );
        x = nextX;
        y = nextY;
        steps++;
        snapshot(command);
      }
    };
    function execute(statements: Statement[]): void {
      for (const statement of statements) {
        if (stopped) return;
        tick();
        switch (statement.kind) {
          case "move":
            move(
              statement.count,
              statement.direction === "forward" ? 1 : -1,
              `robot.${statement.direction}(1)`,
            );
            break;
          case "turn":
            direction =
              directions[
                (directions.indexOf(direction) +
                  (statement.direction === "left" ? 3 : 1)) %
                  4
              ];
            snapshot(`robot.turn_${statement.direction}()`);
            break;
          case "stop":
            stopped = true;
            snapshot("robot.stop()");
            break;
          case "pass":
            break;
          case "repeat": {
            let movingIterations = 0;
            let turningIterations = 0;
            for (let index = 0; index < statement.count && !stopped; index++) {
              tick();
              const before = steps;
              const frameStart = frames.length;
              execute(statement.body);
              if (steps > before) movingIterations++;
              if (
                steps > before &&
                frames
                  .slice(frameStart)
                  .some((frame) => frame.command.startsWith("robot.turn_"))
              )
                turningIterations++;
            }
            if (evidence && movingIterations >= 2) evidence.loopMovement = true;
            if (evidence && turningIterations >= 2) evidence.loopTurn = true;
            break;
          }
          case "if": {
            const condition = blocked(
              x + vectors[direction].x,
              y + vectors[direction].y,
            );
            const frameStart = frames.length;
            execute(condition ? statement.body : statement.otherwise);
            if (
              evidence &&
              frames
                .slice(frameStart)
                .some((frame) =>
                  /^robot\.(forward|backward|turn_)/.test(frame.command),
                )
            )
              evidence[condition ? "trueAction" : "falseAction"] = true;
            break;
          }
        }
      }
    }
    snapshot("Старт");
    execute(program.statements);
    const success = x === world.goal.x && y === world.goal.y;
    return {
      frames,
      success,
      steps,
      message: success
        ? "Задание выполнено. Машина достигла финиша."
        : "Программа завершена. Машина не достигла финиша — проверьте последовательность команд.",
    };
  } catch (error) {
    return {
      frames,
      success: false,
      steps,
      message:
        error instanceof Error
          ? error.message
          : "Не удалось выполнить программу.",
    };
  }
}

export function evaluateCode(
  source: string,
  world: World = DEFAULT_WORLD,
): RunResult {
  try {
    return runProgram(parseProgram(source), world);
  } catch (error) {
    return {
      frames: [],
      success: false,
      steps: 0,
      message: error instanceof Error ? error.message : "Ошибка в программе.",
    };
  }
}
