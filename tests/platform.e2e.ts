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
}) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:5173/")
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
    .getByRole("button", { name: "Присоединиться", exact: true })
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
