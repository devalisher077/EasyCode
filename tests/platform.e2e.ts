import { test, expect } from "@playwright/test";

// These scenarios create classes/submissions. Never run them against a real
// Supabase project or a server with billable AI enabled, even accidentally.
test.beforeEach(async ({ request, page, baseURL }) => {
  let safeDemo = false;
  try {
    const response = await request.get("/api/health");
    if (response.ok()) {
      const health = await response.json();
      safeDemo = health.mode === "demo" && health.aiConfigured === false;
    }
  } catch {
    // An unavailable/unrecognised server must never be treated as a demo.
  }
  test.skip(
    !safeDemo,
    "Platform E2E writes are allowed only with DEMO_MODE=true and AI disabled.",
  );
  const origin = new URL(baseURL!).origin;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin)
      return route.abort("blockedbyclient");
    await route.continue();
  });
});

test("course, block editor, code execution and private file restrictions", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith(`${baseURL}/`)
    )
      externalRequests.push(request.url());
  });
  await page.goto("/learn");
  await expect(
    page.getByRole("heading", { name: "Программа курса" }),
  ).toBeVisible();
  await expect(page.locator(".course-card")).toHaveCount(6);
  await page.screenshot({
    path: "test-results/course-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Найти тему").fill("циклы");
  await expect(page.locator(".course-card")).toHaveCount(1);
  await page.getByLabel("Найти тему").fill("");
  await page.getByRole("button", { name: "1.1 Что такое алгоритм?" }).click();
  await expect(page).toHaveURL(/\/learn\/topic\/1\.1$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Что такое алгоритм?" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Открыть презентацию/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Конспект для учителя/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "К курсу", exact: true }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await page
    .getByRole("button", { name: "Открыть среду", exact: true })
    .click();
  await expect(page).toHaveURL(/\/learn\?practice=1$/);
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  await page.getByRole("button", { name: "В код", exact: true }).click();
  await expect(page.getByLabel("Код программы")).toHaveValue(
    "robot.forward(2)\n",
  );
  await page
    .getByLabel("Код программы")
    .fill("robot.forward(5)\nrobot.turn_left()\nrobot.forward(3)");
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await expect(page.locator(".scene-status")).toContainText("достигла финиша", {
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Проверить решение" }).click();
  await expect(page.getByRole("status")).toContainText("сохранено");
  await page.getByRole("button", { name: "Получить подсказку" }).click();
  await expect(page.locator(".hint-card")).toContainText("Подсказка без AI");
  await page.screenshot({
    path: "test-results/practice-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
  for (const path of [
    "/content/materials/catalog.json",
    "/content/materials/section-01/topic-01/Конспект для учителя.docx",
    "/.env",
    "/server/config.ts",
  ]) {
    const response = await page.request.get(path);
    expect(response.status()).toBeGreaterThanOrEqual(403);
  }
});

test("lesson steps, quiz and course progress survive a reload", async ({
  page,
}) => {
  await page.goto("/learn/topic/1.1");
  await expect(
    page.getByRole("heading", { level: 1, name: "Что такое алгоритм?" }),
  ).toBeVisible();

  // Select every step explicitly: demo progress may already exist from a prior
  // local run, and the lesson intentionally resumes at its first unread step.
  const steps = [
    "План, который можно выполнить",
    "Почему порядок важен",
    "Переводим план на язык машины",
    "Сначала подумай, затем запускай",
  ];
  for (const [index, title] of steps.entries()) {
    await page
      .locator(".lesson-step-list")
      .getByRole("button", { name: new RegExp(title) })
      .click();
    await expect(
      page
        .locator(".lesson-article")
        .getByRole("heading", { level: 2, name: title }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name:
          index === steps.length - 1
            ? "Перейти к проверке"
            : "Отметить и продолжить",
        exact: true,
      })
      .click();
  }
  await expect(
    page.locator(".lesson-step-list li").filter({ hasText: "Прочитано" }),
  ).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "Проверка знаний", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", {
      name: "Понятные исполнителю действия в определённом порядке",
      exact: true,
    })
    .check();
  await page.getByRole("radio", { name: "Машина", exact: true }).check();
  await page
    .getByRole("radio", {
      name: "Она останется на месте и изменит направление",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Проверить ответы", exact: true })
    .click();
  await expect(page.locator(".lesson-quiz-result")).toContainText(
    "Тема завершена.",
  );
  await expect(
    page.getByRole("progressbar", { name: "Прогресс изучения темы" }),
  ).toHaveAttribute("value", "100");

  await page.reload();
  await expect(
    page.getByRole("progressbar", { name: "Прогресс изучения темы" }),
  ).toHaveAttribute("value", "100");
  await expect(page.locator(".lesson-meta-complete")).toHaveText(
    "Тема пройдена",
  );
  await page.getByRole("button", { name: "К курсу", exact: true }).click();
  await expect(page).toHaveURL(/\/learn$/);
  await expect(
    page
      .getByRole("button", { name: "1.1 Что такое алгоритм?" })
      .locator(".topic-done"),
  ).toBeVisible();
  await expect(page.locator(".course-progress-heading h2")).toHaveText(
    /^[1-9]\d* из 12 тем пройдено$/,
  );
});

test("teacher creates content, pupil joins and submits, teacher sees result", async ({
  page,
}) => {
  const className = `Тестовый 4 А · ${Date.now().toString().slice(-6)}`;
  await page.goto("/learn");
  await page.getByLabel("Роль в деморежиме").selectOption("teacher");
  await page
    .getByRole("button", { name: "Кабинет учителя", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Создать класс", exact: true })
    .click();
  await page.getByLabel("Название", { exact: true }).fill(className);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Создать класс", exact: true })
    .click();
  await expect(page.locator(".class-overview h2")).toHaveText(className);
  const code = (await page.locator(".invite-code button").innerText()).trim();
  await page.getByRole("button", { name: "Новый урок", exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill("Команды и маршрут");
  await page
    .getByLabel("Теория урока", { exact: true })
    .fill(
      "Алгоритм — это последовательность точных команд. Порядок очень важен.",
    );
  await page.getByRole("button", { name: "Создать урок", exact: true }).click();
  await expect(page.locator(".custom-section")).toContainText(
    "Команды и маршрут",
  );
  await page.getByRole("button", { name: "Новое задание" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Поездка к флагу");
  await page
    .getByLabel("Условие", { exact: true })
    .fill("Доведи машину до флага, не задевая препятствия.");
  await page
    .getByLabel("Урок", { exact: true })
    .selectOption({ label: "Команды и маршрут" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Создать задание", exact: true })
    .click();
  await expect(page.locator(".assignment-card")).toContainText(
    "Поездка к флагу",
  );
  await page.screenshot({
    path: "test-results/teacher-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Роль в деморежиме").selectOption("student");
  await page
    .getByRole("button", { name: "Присоединиться по коду", exact: true })
    .click();
  await page.getByLabel("Код от учителя").fill(code);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Присоединиться", exact: true })
    .click();
  await expect(page.locator(".class-overview h2")).toHaveText(className);
  await expect(page.locator(".custom-section")).toContainText(
    "последовательность точных команд",
  );
  await page.getByRole("button", { name: "Решить задание" }).click();
  await page.getByRole("button", { name: "Python", exact: true }).click();
  await page
    .getByLabel("Код программы")
    .fill("robot.forward(5)\nrobot.turn_left()\nrobot.forward(3)");
  await page.getByRole("button", { name: "Проверить решение" }).click();
  await expect(page.getByRole("status")).toContainText("сохранено");
  await page.getByLabel("Роль в деморежиме").selectOption("teacher");
  await page
    .getByRole("button", { name: "Кабинет учителя", exact: true })
    .click();
  await page.getByRole("button", { name: className, exact: true }).click();
  await expect(page.locator(".results-table")).toContainText("Выполнено");
});

test("mobile course and navigation fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/learn");
  await expect(page.locator(".course-card")).toHaveCount(6);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/course-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Открыть меню").click();
  await page
    .getByRole("button", { name: "Практическая среда", exact: true })
    .click();
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/practice-mobile.png",
    fullPage: true,
  });
});

test("topic practice checks skills, both maps and fixed electronics assignment", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/learn?practice=1&lesson=3.1");
  await expect(
    page.getByRole("heading", { name: "Шесть шагов циклом" }),
  ).toBeVisible();
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  await page.getByRole("button", { name: "Python", exact: true }).click();
  const check = async (code: string) => {
    await page.getByLabel("Код программы").fill(code);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/submissions") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Проверить решение", exact: true })
      .click();
    return (await response).json();
  };
  expect((await check("robot.forward(6)")).result.success).toBe(false);
  await expect(page.locator(".practice-checks")).toContainText("Не выполнено");
  expect(
    (await check("for i in range(6):\n    robot.forward(1)")).result.success,
  ).toBe(true);
  await page.getByLabel("Практика темы", { exact: true }).selectOption("4.2");
  await expect(
    page.getByRole("heading", { name: "Одна программа — две карты" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Python", exact: true }).click();
  expect(
    (
      await check(
        "if robot.obstacle_ahead():\n    robot.turn_right()\n    robot.forward(2)\n    robot.turn_left()\n    robot.forward(2)\nelse:\n    robot.forward(2)\n    robot.turn_right()\n    robot.forward(2)",
      )
    ).result.success,
  ).toBe(true);
  await page.getByLabel("Карта для просмотра").selectOption("1");
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await expect(page.locator(".scene-status")).toContainText("все условия", {
    timeout: 10000,
  });
  await page.screenshot({
    path: "test-results/topic-practice.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.goto("/learn?practice=1&environment=electronics&lesson=5.2");
  await expect(page.getByLabel("Учебное задание", { exact: true })).toHaveValue(
    "night",
  );
  await expect(
    page.getByLabel("Учебное задание", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "5.2 · Ночник с датчиком" }),
  ).toBeVisible();
  await page.goto("/learn?practice=1&environment=electronics&lesson=5.1");
  await expect(page.getByLabel("Учебное задание", { exact: true })).toHaveValue(
    "blink",
  );
  expect(errors).toEqual([]);
});

test("teacher reviews actual submitted blocks, replays a map and grades a course section", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/learn?practice=1&lesson=1.1");
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  const sent = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/submissions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Проверить решение", exact: true })
    .click();
  const response = await sent;
  expect(response.status()).toBe(200);
  expect(
    (await response.json()).submission.blocks_state.blocks.blocks[0].type,
  ).toBe("easy_forward");
  await page.getByLabel("Роль в деморежиме").selectOption("teacher");
  await page
    .getByRole("button", { name: "Кабинет учителя", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Прогресс и оценки", exact: true })
    .click();
  await expect(page.getByLabel("Ученик", { exact: true })).toContainText(
    "Ученик · демо",
  );
  await page.locator(".journal-attempt").first().click();
  await expect(page.locator(".journal-solution .blocklySvg")).toBeVisible();
  await page
    .locator(".journal-solution .blockly-editor")
    .scrollIntoViewIfNeeded();
  await expect(
    page
      .locator(".journal-solution .blocklyText")
      .filter({ hasText: "вперёд" })
      .first(),
  ).toBeInViewport();
  await expect(page.locator(".journal-code")).toContainText("robot.forward(1)");
  await expect(page.locator(".journal-solution .world-board")).toBeVisible();
  await expect(page.locator(".journal-solution .blocklyToolbox")).toHaveCount(
    0,
  );
  await page.getByLabel("Баллы (0–10)").fill("8");
  await page.getByLabel("Комментарий учителя").fill("Проверь порядок команд.");
  await page
    .getByRole("button", { name: "Сохранить оценку", exact: true })
    .click();
  await expect(page.locator(".journal-grade")).toContainText(
    "Оценка сохранена.",
  );
  await page.screenshot({
    path: "test-results/teacher-journal-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/teacher-journal-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel("Роль в деморежиме").selectOption("student");
  await expect(page.locator(".journal-grades")).toContainText("8/10");
  await expect(page.locator(".journal-grades")).toContainText(
    "Проверь порядок команд.",
  );
  await expect(
    page.getByRole("button", { name: "Сохранить оценку", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("electronics sends its blocks and circuit and teacher can inspect them", async ({
  page,
}) => {
  await page.goto("/learn?practice=1&environment=electronics&lesson=5.1");
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  const sent = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/electronics-submissions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Проверить задание", exact: true })
    .click();
  const response = await sent;
  expect(response.status()).toBe(200);
  expect((await response.json()).submission.circuit.wires).toHaveLength(3);
  await page.getByLabel("Роль в деморежиме").selectOption("teacher");
  await page
    .getByRole("button", { name: "Кабинет учителя", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Прогресс и оценки", exact: true })
    .click();
  await page.locator(".journal-attempt").first().click();
  await expect(page.locator(".journal-solution .blocklySvg")).toBeVisible();
  await expect(page.locator(".journal-circuit")).toBeVisible();
  await expect(page.locator(".journal-solution table")).toContainText(
    "controller.D9",
  );
  await expect(page.locator(".journal-code")).toContainText("led.on()");
});
