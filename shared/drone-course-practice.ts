import { droneMissions, type DroneMission } from "./drone";

/** Local formative tasks. These answer keys never certify a server grade. */
export type DronePracticeQuestion = {
  id: string;
  prompt: string;
  options: { id: string; text: string }[];
  correct: string;
  explanation: string;
};
export type DroneCoursePractice = {
  lessonId: string;
  title: string;
  instructions: string;
  questions: DronePracticeQuestion[];
  mission?: DroneMission;
};
const options = (...text: string[]) =>
  text.map((text, index) => ({ id: String(index), text }));
export const droneCoursePractice: DroneCoursePractice[] = [
  {
    lessonId: "drone-1.1",
    title: "Подберите дрон для задачи",
    instructions:
      "Прочитайте ситуации и выберите подходящее решение. Учитывайте конструкцию аппарата и участие человека.",
    questions: [
      {
        id: "survey",
        prompt:
          "Нужно зависнуть над одним участком и осмотреть его. Какая конструкция подходит?",
        options: options(
          "Многороторный аппарат с подходящей камерой",
          "Любой аппарат с неподвижными крыльями",
          "Любой дрон, даже без подходящего оборудования",
        ),
        correct: "0",
        explanation:
          "Многороторный аппарат способен зависать. Для осмотра также нужны подходящее оборудование и условия полёта.",
      },
      {
        id: "human",
        prompt:
          "Дрон выполняет заранее составленную программу. Что делает человек?",
        options: options(
          "Больше не участвует в работе",
          "Выбирает задачу, готовит аппарат и наблюдает",
          "Обязательно сидит внутри дрона",
        ),
        correct: "1",
        explanation:
          "Автоматическое выполнение команд не отменяет участия человека в подготовке и наблюдении.",
      },
      {
        id: "purpose",
        prompt:
          "Устройство должно перевозить небольшой груз. Что нужно проверить до выбора?",
        options: options(
          "Только цвет корпуса",
          "Только наличие четырёх винтов",
          "Поддерживает ли аппарат нужный груз и условия работы",
        ),
        correct: "2",
        explanation:
          "Не каждый дрон предназначен для перевозки груза. Возможности аппарата должны соответствовать задаче.",
      },
    ],
  },
  {
    lessonId: "drone-1.2",
    title: "Соберите паспорт квадрокоптера",
    instructions:
      "Соотнесите функцию с частью квадрокоптера. Винт, двигатель, аккумулятор и полётный контроллер выполняют разные задачи.",
    questions: [
      {
        id: "propeller",
        prompt:
          "Какая часть, вращаясь, взаимодействует с воздухом и создаёт тягу?",
        options: options("Винт (пропеллер)", "Аккумулятор", "Рама"),
        correct: "0",
        explanation:
          "Винты создают тягу при вращении. Их вращают электродвигатели.",
      },
      {
        id: "motor",
        prompt: "Какая часть вращает винт?",
        options: options(
          "Полётный контроллер",
          "Электродвигатель",
          "Защита винта",
        ),
        correct: "1",
        explanation:
          "Электродвигатель преобразует электрическую энергию в механическое вращение.",
      },
      {
        id: "battery",
        prompt: "Какая часть снабжает электронику и двигатели энергией?",
        options: options("Рама", "Камера", "Аккумулятор"),
        correct: "2",
        explanation:
          "Аккумулятор хранит энергию. Его заряд ограничивает время работы аппарата.",
      },
      {
        id: "controller",
        prompt: "Какая часть обрабатывает данные и управляет работой аппарата?",
        options: options(
          "Полётный контроллер",
          "Винт (пропеллер)",
          "Защита винта",
        ),
        correct: "0",
        explanation:
          "Полётный контроллер обрабатывает команды и данные датчиков, чтобы управлять полётом.",
      },
      {
        id: "frame",
        prompt: "Какая часть соединяет и удерживает основные узлы?",
        options: options("Камера", "Рама", "Аккумулятор"),
        correct: "1",
        explanation:
          "Рама служит основой конструкции. Камера является оборудованием для съёмки, а не обязательным признаком дрона.",
      },
    ],
  },
  {
    lessonId: "drone-2.1",
    title: "Подготовьте лабораторию к работе",
    instructions:
      "Выберите миссию и элементы управления для описанных действий. После проверки можно перейти к свободной 3D-практике.",
    questions: [
      {
        id: "mission",
        prompt:
          "Нужно изучить простой прямой маршрут без груза. Какую миссию выбрать?",
        options: options("Дрон-доставщик", "Первый полёт", "Воздушный маршрут"),
        correct: "1",
        explanation:
          "Миссия «Первый полёт» предлагает прямой маршрут до площадки. Доставка и кольца относятся к другим миссиям.",
      },
      {
        id: "step",
        prompt:
          "Нужно наблюдать выполнение по отдельным шагам. Какую кнопку нажать?",
        options: options("Шаг", "Сохранить черновик", "Вернуть камеру"),
        correct: "0",
        explanation:
          "Кнопка «Шаг» показывает очередной шаг модели. Длинное движение включает несколько клеток и несколько шагов.",
      },
      {
        id: "reset",
        prompt:
          "Перед повторной проверкой нужно вернуть дрон в начальное состояние. Что выбрать?",
        options: options("В код", "Запустить", "Сбросить"),
        correct: "2",
        explanation:
          "Сброс возвращает полёт в начальное состояние, сохраняя написанную программу.",
      },
      {
        id: "save",
        prompt:
          "Нужно сохранить программу перед уходом со страницы. Что выбрать?",
        options: options("Вернуть камеру", "Сохранить черновик", "Остановить"),
        correct: "1",
        explanation:
          "Черновик сохраняется отдельной кнопкой в текущем браузере. Остановка полёта не является сохранением.",
      },
    ],
  },
  {
    lessonId: "drone-2.2",
    title: "Предскажите положение дрона",
    instructions:
      "Читайте координаты в порядке (X, Y, Z). Y — высота. Направление носа влияет на следующую команду движения.",
    questions: [
      {
        id: "height",
        prompt: "Дрон в точке (1, 1, 1). Он поднимается на 1. Где он теперь?",
        options: options("(2, 1, 1)", "(1, 2, 1)", "(1, 1, 2)"),
        correct: "1",
        explanation:
          "Подъём изменяет только Y: 1 + 1 = 2. Клетка на поле остаётся прежней.",
      },
      {
        id: "turn",
        prompt:
          "Дрон в точке (3, 1, 1), нос направлен по +X. Он поворачивает направо на 90°. Что изменилось?",
        options: options(
          "Точка стала (3, 1, 2)",
          "Высота стала 2",
          "Точка прежняя; направление стало +Z",
        ),
        correct: "2",
        explanation:
          "Поворот меняет направление, но не координаты. После правого поворота от +X нос смотрит по +Z.",
      },
      {
        id: "forward",
        prompt:
          "Из точки (3, 1, 1), глядя по +Z, дрон летит вперёд на 2. Где он окажется?",
        options: options("(3, 1, 3)", "(5, 1, 1)", "(3, 3, 1)"),
        correct: "0",
        explanation:
          "Движение по +Z увеличивает Z на 2: 1 + 2 = 3. X и Y не меняются.",
      },
      {
        id: "landing",
        prompt:
          "Дрон садится из точки (3, 2, 3) на землю. Какими станут координаты?",
        options: options("(0, 2, 0)", "(3, 0, 3)", "(3, 1, 3)"),
        correct: "1",
        explanation:
          "После посадки на землю Y равен 0. Посадка не меняет X и Z.",
      },
    ],
  },
  {
    lessonId: "drone-3.1",
    title: "Программа первого полёта",
    instructions:
      "Составьте программу из блоков или кода: взлетите из (1, 0, 1), пролетите четыре клетки по +X и приземлитесь в (5, 0, 1). Сверяйте координаты кнопкой «Шаг».",
    questions: [],
    mission: { ...droneMissions[0], id: "course-drone-3.1" },
  },
  {
    lessonId: "drone-3.2",
    title: "Подъём и поворот к площадке",
    instructions:
      "Взлетите, пролетите вперёд 2 клетки, поднимитесь на 1, поверните направо, пролетите ещё 1 клетку и приземлитесь. Пройдите кольцо (3, 2, 1), затем сядьте в (3, 0, 2).",
    questions: [],
    mission: {
      id: "course-drone-3.2",
      title: "Подъём и поворот к площадке",
      description:
        "Пройдите кольцо в точке (3, 2, 1) и приземлитесь на синей площадке (3, 0, 2). Начальное направление — +X.",
      start: { x: 1, y: 0, z: 1 },
      finish: { x: 3, y: 0, z: 2 },
      obstacles: [],
      checkpoints: [{ x: 3, y: 2, z: 1 }],
    },
  },
];
export const dronePracticeForLesson = (lessonId: string) =>
  droneCoursePractice.find((p) => p.lessonId === lessonId);
export function checkDronePractice(
  lessonId: string,
  answers: Record<string, string>,
) {
  const practice = dronePracticeForLesson(lessonId);
  if (!practice?.questions.length) return null;
  const complete = practice.questions.every((q) =>
    q.options.some((o) => o.id === answers[q.id]),
  );
  const feedback = practice.questions.map((q) => ({
    id: q.id,
    correct: answers[q.id] === q.correct,
    explanation: q.explanation,
  }));
  const score = feedback.filter((f) => f.correct).length;
  return {
    complete,
    score,
    total: practice.questions.length,
    passed: complete && score === practice.questions.length,
    feedback,
  };
}
