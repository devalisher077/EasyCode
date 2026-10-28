import { test, expect } from "@playwright/test";
const url = "/learn?practice=1&environment=drone";
const flight = "drone.takeoff()\ndrone.forward(4)\ndrone.land()";
test("3D lab renders, converts blocks, completes a flight and saves its draft", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "3D-лаборатория" }),
  ).toBeVisible();
  await expect(page.locator(".drone-scene canvas")).toBeVisible();
  await expect(page.locator(".drone-webgl-error")).toHaveCount(0);
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  await expect(page.locator(".injectionDiv")).toHaveCSS("height", "430px");
  await page.getByRole("button", { name: "В код", exact: true }).click();
  await expect(page.getByLabel("Код программы дрона")).toHaveValue(
    "drone.takeoff()\ndrone.forward(1)\n",
  );
  await page.getByLabel("Код программы дрона").fill(flight);
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await expect(page.locator(".drone-flight-status")).toContainText(
    "Миссия выполнена",
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.locator(".drone-local-note")).toContainText(
    "Черновик сохранён",
  );
  await page.screenshot({
    path: "test-results/drone-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel("Код программы дрона")).toHaveValue(flight);
  await page.getByRole("button", { name: "Электроника", exact: true }).click();
  await expect(page.locator(".drone-scene")).toHaveCount(0);
  await page
    .getByRole("button", { name: "3D-лаборатория", exact: true })
    .click();
  await expect(page.locator(".drone-scene canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
test("checkpoint flight reports collisions, supports stepping and stops on edits", async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole("button", { name: /Воздушный маршрут/ }).click();
  await page.getByRole("button", { name: "Код", exact: true }).click();
  await page
    .getByLabel("Код программы дрона")
    .fill("drone.takeoff()\ndrone.forward(4)");
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await expect(page.locator(".drone-flight-status")).toContainText(
    "Столкновение",
  );
  await page
    .getByLabel("Код программы дрона")
    .fill(
      "drone.takeoff()\ndrone.up(1)\ndrone.forward(4)\ndrone.turn_right()\ndrone.forward(4)\ndrone.land()",
    );
  await page.getByRole("button", { name: "Шаг", exact: true }).click();
  await expect(page.locator(".drone-telemetry")).toContainText("1 / 5");
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await expect(page.locator(".drone-flight-status")).toContainText(
    "Миссия выполнена",
    { timeout: 15000 },
  );
  await expect(page.locator(".drone-telemetry")).toContainText("2 / 2");
  await page.screenshot({
    path: "test-results/drone-checkpoints.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await page.getByLabel("Код программы дрона").fill("drone.takeoff()");
  await expect(
    page.getByRole("button", { name: "Запустить", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".drone-telemetry")).toContainText("0 / 5");
});
test("delivery requires picking up, flying over a wall and dropping cargo", async ({
  page,
}) => {
  await page.goto(url);
  await page.getByRole("button", { name: /Дрон-доставщик/ }).click();
  await page.getByRole("button", { name: "Код", exact: true }).click();
  await page
    .getByLabel("Код программы дрона")
    .fill(
      "drone.takeoff()\ndrone.forward(4)\ndrone.land()\ndrone.pickup()\ndrone.takeoff()\ndrone.up(2)\ndrone.turn_right()\ndrone.forward(4)\ndrone.land()\ndrone.drop()",
    );
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await expect(page.locator(".drone-flight-status")).toContainText(
    "Миссия выполнена",
    { timeout: 15000 },
  );
});
test("mobile laboratory fits the viewport and uses Kazakh labels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("easycode:language", "kk"),
  );
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "3D зертхана" }),
  ).toBeVisible();
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  await expect(page.locator(".drone-scene canvas")).toBeVisible();
  await expect(page.locator(".injectionDiv")).toHaveCSS("height", "430px");
  await expect(
    page.locator(".blocklyText").filter({ hasText: "ұшу" }).last(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/drone-mobile.png",
    fullPage: true,
  });
});
test("without WebGL the code interpreter remains usable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return (original as Function).apply(this, [type, ...args]);
    } as typeof original;
  });
  await page.goto(url);
  await expect(page.getByRole("alert")).toContainText("3D недоступно");
  await page.getByRole("button", { name: "Код", exact: true }).click();
  await page.getByLabel("Код программы дрона").fill(flight);
  await page.getByRole("button", { name: "Запустить", exact: true }).click();
  await expect(page.locator(".drone-flight-status")).toContainText(
    "Миссия выполнена",
    { timeout: 10000 },
  );
});
