import { expect, test, type Page } from "@playwright/test";

/** A public landing page must not contact a real account or cloud API. */
async function isolateNetwork(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const externalRequests: string[] = [];
  const apiRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) {
      externalRequests.push(`${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (url.pathname.startsWith("/api/")) {
      apiRequests.push(url.pathname);
      if (url.pathname === "/api/health")
        return route.fulfill({
          json: { mode: "demo", aiConfigured: false },
        });
      return route.fulfill({
        status: 401,
        json: { message: "Isolated landing test: no authenticated session." },
      });
    }
    await route.continue();
  });
  return { externalRequests, apiRequests };
}

test("public introduction is separate from the authenticated platform", async ({
  page,
  baseURL,
}) => {
  const network = await isolateNetwork(page, baseURL!);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Программирование: от основ к практике.",
    }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", {
    name: "Основная навигация",
  });
  for (const section of ["features", "practice", "teachers"]) {
    await expect(navigation.locator(`a[href="#${section}"]`)).toBeVisible();
    await expect(page.locator(`#${section}`)).toBeAttached();
  }
  await expect(page.locator(".blocklySvg")).toHaveCount(0);
  expect(network.apiRequests).not.toContain("/api/me");
  expect(network.externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("login and registration open accessible dialogs without submitting data", async ({
  page,
  baseURL,
}) => {
  const network = await isolateNetwork(page, baseURL!);
  await page.goto("/");
  const login = page
    .getByRole("button", { name: "Войти", exact: true })
    .first();
  await login.click();
  await expect(page).toHaveURL(/\/login$/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Электронная почта")).toBeVisible();
  await expect(dialog.getByLabel("Пароль", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Имя", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(login).toBeFocused();

  await page
    .getByRole("button", { name: "Начать обучение", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Имя", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Зарегистрироваться", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(network.externalRequests).toEqual([]);
  expect(network.apiRequests).not.toContain("/api/me");
});

test("guest practice links to the existing learning workspace", async ({
  page,
  baseURL,
}) => {
  const network = await isolateNetwork(page, baseURL!);
  await page.goto("/");
  // Do not exercise classroom writes or AI while checking the public CTA.
  await page
    .getByRole("button", { name: /Попробовать (без входа|демо)/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/learn\?practice=1$/);
  expect(network.externalRequests).toEqual([]);
});

test("mobile introduction and auth dialog fit the viewport", async ({
  page,
  baseURL,
}) => {
  await isolateNetwork(page, baseURL!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Программирование: от основ к практике.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("button", { name: "Начать обучение", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Зарегистрироваться", exact: true }),
  ).toBeInViewport();
});

test("motion preference survives reload and dialogs temporarily suspend it", async ({
  page,
  baseURL,
}) => {
  const network = await isolateNetwork(page, baseURL!);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const landing = page.locator(".lp");
  await expect(landing).toHaveClass(/lp-motion-on/);
  await page
    .getByRole("button", { name: "Приостановить анимации", exact: true })
    .click();
  await expect(landing).toHaveClass(/lp-motion-off/);
  await page.reload();
  await expect(landing).toHaveClass(/lp-motion-off/);
  await page
    .getByRole("button", { name: "Включить анимации", exact: true })
    .click();
  await expect(landing).toHaveClass(/lp-motion-on/);
  await page
    .getByRole("button", { name: "Войти", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(landing).toHaveClass(/lp-motion-off/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(landing).toHaveClass(/lp-motion-on/);
  expect(network.externalRequests).toEqual([]);
});

test("reduced motion keeps all landing content visible and disables animation controls", async ({
  page,
  baseURL,
}) => {
  const network = await isolateNetwork(page, baseURL!);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".lp")).toHaveClass(/lp-motion-off/);
  await expect(
    page.getByRole("button", {
      name: "Анимации отключены настройкой устройства",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.locator(".lp-reveal-pending")).toHaveCount(0);
  await expect(page.locator("#features")).toBeVisible();
  await expect(page.locator("#teachers")).toBeVisible();
  await expect(page.locator("#faq")).toBeVisible();
  expect(network.apiRequests).not.toContain("/api/me");
  expect(network.externalRequests).toEqual([]);
});
