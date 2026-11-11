import { test, expect } from "@playwright/test";
import { droneLessons } from "../content/drone-lessons";

test.beforeEach(async ({ request }) => {
  const health = await request.get("/api/health");
  test.skip(
    !health.ok() || (await health.json()).mode !== "demo",
    "Local demo only; no real accounts.",
  );
});

test("drone course is separate, has six sections with three upcoming and returns to its own catalog", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/learn");
  await page.getByRole("button", { name: "Дроны", exact: true }).click();
  await expect(page).toHaveURL(/course=drones/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Дроны" }),
  ).toBeVisible();
  await expect(page.locator(".course-card")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Материалы готовятся", exact: true }),
  ).toHaveCount(3);
  for (const button of await page
    .getByRole("button", { name: "Материалы готовятся", exact: true })
    .all())
    await expect(button).toBeDisabled();
  await page.getByRole("button", { name: /1\.1 Что такое дрон/ }).click();
  await expect(page).toHaveURL(/\/learn\/topic\/drone-1\.1/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Что такое дрон и где его используют",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "К курсу", exact: true }).click();
  await expect(page).toHaveURL(/course=drones/);
  await page.screenshot({
    path: "test-results/drone-course-catalog.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Основы программирования", exact: true })
    .click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(
    page.getByRole("button", { name: "1.1 Что такое алгоритм?", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [topic, title, correctAnswers] of [
  ["1.1", "Подберите дрон для задачи", ["0", "1", "2"]],
  ["1.2", "Соберите паспорт квадрокоптера", ["0", "1", "2", "0", "1"]],
  ["2.1", "Подготовьте лабораторию к работе", ["1", "0", "2", "1"]],
  ["2.2", "Предскажите положение дрона", ["1", "2", "0", "1"]],
] as const) {
  test(`topic ${topic} offers its own interactive task and persists local answers`, async ({
    page,
  }) => {
    await page.goto(
      `/learn?practice=1&environment=drone&lesson=drone-${topic}`,
    );
    await expect(
      page.getByRole("heading", { name: title, level: 1 }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Проверить ответы", exact: true })
      .click();
    await expect(page.locator(".drone-practice-result")).toContainText(
      "Сначала ответьте",
    );
    const selects = page.locator(".drone-practice-questions select");
    await expect(selects).toHaveCount(correctAnswers.length);
    for (let i = 0; i < correctAnswers.length; i++)
      await selects.nth(i).selectOption(correctAnswers[i]);
    await page
      .getByRole("button", { name: "Проверить ответы", exact: true })
      .click();
    await expect(page.locator(".drone-practice-result")).toContainText(
      "Все ответы верны",
    );
    await page.reload();
    for (let i = 0; i < correctAnswers.length; i++)
      await expect(selects.nth(i)).toHaveValue(correctAnswers[i]);
    await page.getByRole("button", { name: "К уроку", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/learn/topic/drone-${topic}`));
  });
}

for (const [topic, code] of [
  ["3.1", "drone.takeoff()\ndrone.forward(4)\ndrone.land()"],
  [
    "3.2",
    "drone.takeoff()\ndrone.forward(2)\ndrone.up(1)\ndrone.turn_right()\ndrone.forward(1)\ndrone.land()",
  ],
]) {
  test(`topic ${topic} launches a dedicated 3D mission`, async ({ page }) => {
    await page.goto(
      `/learn?practice=1&environment=drone&lesson=drone-${topic}`,
    );
    await expect(page.locator(".drone-missions")).toHaveCount(0);
    await expect(page.locator(".drone-scene canvas")).toBeVisible();
    await page.getByRole("button", { name: "Код", exact: true }).click();
    await page.getByLabel("Код программы дрона").fill(code);
    await page.getByRole("button", { name: "Запустить", exact: true }).click();
    await expect(page.locator(".drone-flight-status")).toContainText(
      "Миссия выполнена",
      { timeout: 12000 },
    );
    if (topic === "3.2") {
      await page
        .getByLabel("Код программы дрона")
        .fill(code.replace("drone.up(1)\n", ""));
      await page
        .getByRole("button", { name: "Запустить", exact: true })
        .click();
      await expect(page.locator(".drone-flight-status")).toContainText(
        "Выполните все условия",
        { timeout: 12000 },
      );
    }
  });
}

test("all six drone presentations open in the browser viewer", async ({
  page,
}) => {
  for (const topic of ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2"]) {
    await page.goto(`/learn/topic/drone-${topic}`);
    await page.getByRole("button", { name: /Открыть презентацию/ }).click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.locator("canvas")).toBeVisible();
    await expect(viewer.locator(".presentation-stage")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(viewer.getByRole("alert")).toHaveCount(0);
    await viewer
      .getByRole("button", { name: "Следующий слайд", exact: true })
      .click();
    await expect(viewer.locator(".presentation-page-count")).toContainText(
      "Слайд 2",
    );
  }
});

test("mobile Kazakh drone practice fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("easycode:language", "kk"),
  );
  await page.goto("/learn?practice=1&environment=drone&lesson=drone-1.2");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Квадрокоптердің бөлшектерін анықтаңыз",
    }),
  ).toBeVisible();
  await expect(page.locator(".drone-practice-questions select")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/drone-course-mobile.png",
    fullPage: true,
  });
});

test("drone theory progress survives reload without changing programming progress", async ({
  page,
}) => {
  const definition = droneLessons.find((l) => l.id === "drone-1.1")!;
  await page.goto("/learn/topic/1.1");
  const progress = page.getByRole("progressbar", {
    name: "Прогресс изучения темы",
  });
  await expect(progress).toBeVisible();
  const original = await progress.getAttribute("value");
  await page.goto("/learn/topic/drone-1.1");
  for (let i = 0; i < definition.steps.length; i++) {
    await page
      .locator(".lesson-step-list")
      .getByRole("button", { name: new RegExp(definition.steps[i].title) })
      .click();
    await page
      .getByRole("button", {
        name:
          i === definition.steps.length - 1
            ? "Перейти к проверке"
            : "Отметить и продолжить",
        exact: true,
      })
      .click();
  }
  for (const q of definition.quiz)
    await page
      .getByRole("radio", {
        name: q.options.find((o) => o.id === q.correctOptionId)!.text,
        exact: true,
      })
      .check();
  await page
    .getByRole("button", { name: "Проверить ответы", exact: true })
    .click();
  await expect(progress).toHaveAttribute("value", "100");
  await page.reload();
  await expect(progress).toHaveAttribute("value", "100");
  await page.getByRole("button", { name: "К курсу", exact: true }).click();
  await expect(page).toHaveURL(/course=drones/);
  await expect(
    page
      .getByRole("button", {
        name: "1.1 Что такое дрон и где его используют",
        exact: true,
      })
      .locator(".topic-done"),
  ).toBeVisible();
  await page.goto("/learn/topic/1.1");
  await expect(progress).toHaveAttribute("value", original!);
});

test("English drone lesson and its practice are fully translated", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("easycode:language", "en"),
  );
  await page.goto("/learn/topic/drone-2.2");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  expect(await heading.innerText()).not.toMatch(/[А-Яа-яЁё]/);
  const article = page.locator(".lesson-article");
  await expect(article).toContainText("Coordinates are written");
  expect(await article.innerText()).not.toMatch(/[А-Яа-яЁё]/);
  await page.getByRole("button", { name: /Open practice workspace/ }).click();
  await expect(page).toHaveURL(/lesson=drone-2.2/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Predict the drone position" }),
  ).toBeVisible();
  expect(
    await page.locator(".drone-question-workbench").innerText(),
  ).not.toMatch(/[А-Яа-яЁё]/);
});
