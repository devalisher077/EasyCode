import {
  evaluateCode,
  parseProgram,
  runProgram,
  type World,
  type RunResult,
  type ExecutionEvidence,
} from "./simulator.js";
import type { Exercise } from "./electronics.js";

type Rule =
  | "turn"
  | "two-turns"
  | "backward"
  | "loop"
  | "loop-turn"
  | "condition"
  | "both-branches";
export interface CourseRobotTask {
  id: string;
  lesson_id: string;
  class_id: null;
  section_id: null;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  world: World;
  variants: World[];
  rules: Rule[];
  maxSteps?: number;
  starterCode: string;
  starterBlocks?: object;
}
const world = (
  width: number,
  height: number,
  x: number,
  y: number,
  direction: World["start"]["direction"],
  gx: number,
  gy: number,
  walls: [number, number][] = [],
): World => ({
  width,
  height,
  start: { x, y, direction },
  goal: { x: gx, y: gy },
  obstacles: walls.map(([x, y]) => ({ x, y })),
});
const task = (
  lesson: string,
  title: string,
  description: string,
  map: World,
  rules: Rule[] = [],
  extra: Partial<CourseRobotTask> = {},
): CourseRobotTask => ({
  id: `course-${lesson.replace(".", "-")}`,
  lesson_id: lesson,
  class_id: null,
  section_id: null,
  title,
  description,
  world: map,
  variants: [],
  rules,
  difficulty:
    Number(lesson[0]) < 3 ? "easy" : Number(lesson[0]) < 6 ? "medium" : "hard",
  starterCode: "robot.forward(1)\n",
  ...extra,
});
export const courseRobotTasks: CourseRobotTask[] = [
  task(
    "1.1",
    "Первая доставка",
    "Доставь машину по прямой к флагу. Посчитай клетки и задай точное число шагов.",
    world(6, 3, 0, 1, "east", 3, 1),
  ),
  task(
    "1.2",
    "Команды по порядку",
    "Доедь до флага за углом. Используй движение и поворот в правильном порядке, не задень препятствие.",
    world(5, 5, 1, 3, "east", 3, 1, [[2, 2]]),
    ["turn"],
  ),
  task(
    "2.1",
    "Два поворота",
    "Собери маршрут вокруг преграды. Для зачёта машина должна выполнить не менее двух поворотов и дойти до флага.",
    world(6, 5, 1, 3, "east", 4, 1, [
      [3, 3],
      [3, 2],
    ]),
    ["two-turns"],
  ),
  task(
    "2.2",
    "Выезд с парковки",
    "Впереди машины стена. Используй хотя бы один шаг назад, затем доберись до парковочного флага.",
    world(6, 4, 4, 2, "east", 1, 1, [
      [5, 2],
      [4, 3],
    ]),
    ["backward"],
  ),
  task(
    "3.1",
    "Шесть шагов циклом",
    "Доедь до флага с помощью цикла. Цикл должен выполнить движение хотя бы в двух повторениях; простая запись шести шагов не засчитывается.",
    world(8, 3, 0, 1, "east", 6, 1),
    ["loop"],
  ),
  task(
    "3.2",
    "Лестница повторений",
    "Пройди лестницу к флагу. В повторяющемся фрагменте должны выполняться и движение, и повороты.",
    world(6, 6, 0, 5, "east", 4, 1, [
      [1, 2],
      [2, 2],
      [3, 1],
      [2, 5],
      [3, 4],
      [4, 3],
    ]),
    ["loop-turn"],
  ),
  task(
    "4.1",
    "Решение перед преградой",
    "Машина смотрит на препятствие. Проверь его условием и выполни действие в ветке «если», затем доберись до флага.",
    world(4, 4, 1, 3, "north", 2, 2, [[1, 2]]),
    ["condition"],
  ),
  task(
    "4.2",
    "Одна программа — две карты",
    "Одна программа должна дойти до флага на обеих картах. На первой путь впереди закрыт, на второй свободен. Используй действующие ветки if и else.",
    world(5, 5, 1, 3, "north", 3, 1, [[1, 2]]),
    ["both-branches"],
    {
      variants: [world(5, 5, 1, 3, "north", 3, 1, [[4, 3]])],
    },
  ),
  task(
    "6.1",
    "Проект: патруль до станции",
    "Доставь машину на станцию. Объедини цикл движения и условие: при преграде измени направление. Обе конструкции должны сработать.",
    world(7, 6, 1, 4, "east", 5, 1, [
      [6, 4],
      [2, 2],
      [3, 2],
    ]),
    ["loop", "condition"],
  ),
  task(
    "6.2",
    "Отладка: неверный поворот",
    "В стартовой программе неверный поворот. Исправь её, сохрани работающие цикл и условие и доберись до флага не более чем за 7 шагов движения.",
    world(8, 6, 1, 4, "east", 6, 2, [
      [7, 4],
      [2, 1],
      [3, 1],
      [4, 1],
    ]),
    ["loop", "condition"],
    {
      maxSteps: 7,
      starterCode:
        "for i in range(7):\n    if robot.obstacle_ahead():\n        robot.turn_right()\n    else:\n        pass\n    robot.forward(1)\n",
      starterBlocks: {
        blocks: {
          languageVersion: 0,
          blocks: [
            {
              type: "easy_repeat",
              x: 35,
              y: 45,
              fields: { COUNT: 7 },
              inputs: {
                BODY: {
                  block: {
                    type: "easy_if",
                    inputs: { BODY: { block: { type: "easy_right" } } },
                    next: {
                      block: { type: "easy_forward", fields: { COUNT: 1 } },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  ),
];
export const courseElectronics: Record<
  string,
  { exercise: Exercise; title: string; description: string }
> = {
  "5.1": {
    exercise: "blink",
    title: "Световой сигнал",
    description:
      "Собери цепь платы, резистора и светодиода. Запрограммируй три включения и выключения с паузами не менее 200 мс. Проверяются схема и программа.",
  },
  "5.2": {
    exercise: "night",
    title: "Ночник с датчиком",
    description:
      "Подключи датчик света и светодиод. При освещённости ниже 40% свет должен гореть, а при 40% и выше — выключаться. Проверка использует несколько значений освещённости.",
  },
};
export const courseTaskById = (id: string) =>
  courseRobotTasks.find((task) => task.id === id);
export const courseTaskByLesson = (id: string) =>
  courseRobotTasks.find((task) => task.lesson_id === id);
export function coursePractice(id: string) {
  const value = courseTaskByLesson(id) || courseElectronics[id];
  return value
    ? {
        title: value.title,
        instructions: [
          value.description,
          "Открой практику этой темы. После выполнения нажми кнопку проверки, чтобы сохранить результат в журнале учителя.",
        ],
        availableInSimulator: true,
      }
    : undefined;
}
export const ruleLabels: Record<Rule, string> = {
  turn: "Выполнить поворот",
  "two-turns": "Выполнить два поворота",
  backward: "Выполнить движение назад",
  loop: "Выполнить движение в нескольких повторениях цикла",
  "loop-turn": "Повторить в цикле движение и повороты",
  condition: "Выполнить действие по условию препятствия",
  "both-branches": "Использовать обе ветки условия на двух картах",
};
export type PracticeCheck = { label: string; passed: boolean };
export type CourseRunResult = RunResult & { checks?: PracticeCheck[] };
export function evaluateCourseTask(
  code: string,
  task: CourseRobotTask,
  visibleMap = 0,
): CourseRunResult {
  const maps = [task.world, ...task.variants];
  let program;
  try {
    program = parseProgram(code);
  } catch {
    return evaluateCode(code, maps[visibleMap] || maps[0]);
  }
  const evidence: ExecutionEvidence[] = [];
  const results = maps.map((map) => {
    const facts: ExecutionEvidence = {
      loopMovement: false,
      loopTurn: false,
      trueAction: false,
      falseAction: false,
    };
    evidence.push(facts);
    return runProgram(program, map, facts);
  });
  const frames = results.flatMap((result) => result.frames);
  const rules: Record<Rule, boolean> = {
    turn: frames.some((f) => f.command.startsWith("robot.turn_")),
    "two-turns":
      frames.filter((f) => f.command.startsWith("robot.turn_")).length >= 2,
    backward: frames.some((f) => f.command === "robot.backward(1)"),
    loop: evidence.some((e) => e.loopMovement),
    "loop-turn": evidence.some((e) => e.loopTurn),
    condition: evidence.some((e) => e.trueAction),
    "both-branches":
      evidence.some((e) => e.trueAction) && evidence.some((e) => e.falseAction),
  };
  const checks: PracticeCheck[] = [
    ...results.map((result, i) => ({
      label:
        maps.length > 1 ? `Дойти до флага на карте ${i + 1}` : "Дойти до флага",
      passed: result.success,
    })),
    ...task.rules.map((rule) => ({
      label: ruleLabels[rule],
      passed: rules[rule],
    })),
    ...(task.maxSteps === undefined
      ? []
      : [
          {
            label: `Не более ${task.maxSteps} шагов движения`,
            passed: results.every((r) => r.steps <= task.maxSteps!),
          },
        ]),
  ];
  const result = results[visibleMap] || results[0];
  const success = checks.every((check) => check.passed);
  return {
    ...result,
    success,
    checks,
    message: success
      ? "Практика темы выполнена: все условия проверки пройдены."
      : !result.success
        ? result.message
        : "Флаг достигнут, но не все условия задания выполнены. Посмотри список проверки.",
  };
}
