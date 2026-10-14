import { test, expect } from "@playwright/test";

for (const topic of ["2.1", "2.2", "4.1", "4.2", "5.1", "5.2", "6.1", "6.2"]) {
  test(`imported presentation ${topic} opens and navigates in the viewer`, async ({
    page,
    request,
    baseURL,
  }) => {
    const health = await request.get("/api/health");
    test.skip(
      !health.ok() || (await health.json()).mode !== "demo",
      "Local demo only; no real accounts.",
    );
    const origin = new URL(baseURL!).origin;
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return /^https?:$/.test(url.protocol) && url.origin !== origin
        ? route.abort()
        : route.continue();
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/learn/topic/${topic}`);
    await page.getByRole("button", { name: /Открыть презентацию/ }).click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.locator(".presentation-page-count")).toHaveText(
      "Слайд 1 из 12",
    );
    await expect(viewer.locator("canvas")).toBeVisible();
    await expect(viewer.locator(".presentation-render-status")).toHaveCount(0);
    expect(
      await viewer.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let nonWhite = 0;
        for (let i = 0; i < pixels.length; i += 400)
          if (pixels[i] < 220 || pixels[i + 1] < 220 || pixels[i + 2] < 220)
            nonWhite++;
        return nonWhite > 100;
      }),
    ).toBe(true);
    await viewer
      .getByRole("button", { name: "Следующий слайд", exact: true })
      .click();
    await expect(viewer.locator(".presentation-page-count")).toHaveText(
      "Слайд 2 из 12",
    );
    await expect(viewer.locator(".presentation-render-status")).toHaveCount(0);
    await expect(viewer.getByRole("alert")).toHaveCount(0);
    await expect(viewer.locator(".presentation-stage")).toHaveAttribute("aria-busy", "false");
    await expect(viewer.locator("canvas")).toBeVisible();
    if (topic === "5.1")
      await viewer.screenshot({
        path: "test-results/imported-presentation.png",
      });
    expect(errors).toEqual([]);
  });
}
