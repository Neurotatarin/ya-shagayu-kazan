import { expect, test, type Page } from "@playwright/test";
import { deterministicServices } from "./services";

test.beforeEach(async ({ page }) => {
  // These tests verify map UI, not guest provisioning or server persistence.
  // Keep them isolated from the public-link abuse budget; API tests and
  // screens/resilience tests cover the actual guest and progress service.
  await page.route("**/api/guest", route => route.fulfill({ json: { token: "map-context-test-guest" } }));
  let progress = { favorites: [], visited: [], positions: {} };
  await page.route("**/api/progress", route => {
    if (route.request().method() === "PUT") progress = route.request().postDataJSON();
    return route.fulfill({ json: progress });
  });
});

async function emptyMapPoint(page: Page) {
  return page.locator(".maplibregl-canvas").evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    for (const y of [.3, .4, .5, .6]) for (const x of [.65, .4, .8, .2]) {
      const point = { x: box.x + box.width * x, y: box.y + box.height * y };
      if (document.elementFromPoint(point.x, point.y) === canvas) return point;
    }
    throw new Error("No free map surface");
  });
}
async function tapMap(page: Page) { const point = await emptyMapPoint(page); await page.mouse.click(point.x, point.y); }

test("place cards are contextual; blank taps, panning and swipes free the map and controls return without a button", async ({ page }, info) => {
  await deterministicServices(page, { keepAudio: true });
  const requests: string[] = []; page.on("request", r => { if (r.url().endsWith("/api/walking-route")) requests.push(r.url()); });
  await page.goto("/#/map");
  const map = page.locator("main.map-page"), card = page.locator(".next-stop-card");
  await expect(map).toHaveAttribute("data-map-ready", "true");
  await expect(page.locator("[data-place-id]")).toHaveCount(20);
  await expect(card).not.toBeVisible();
  await expect(page.locator(".map-route-peek")).not.toBeVisible();
  const canvasHeight = (await page.locator(".maplibregl-canvas").boundingBox())!.height;
  await page.locator('[data-place-id="kul-sharif"]').click();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Кул-Шариф");
  await expect(map).toHaveAttribute("data-map-quiet", "false");
  await tapMap(page);
  await expect(card).not.toBeVisible();
  await expect(map).toHaveAttribute("data-map-quiet", "true");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Выбрать язык" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Моё местоположение" })).toBeVisible();
  await page.screenshot({ path: `test-results/screenshots/map-free-${info.project.name}.png` });
  await tapMap(page);
  await expect(page.getByRole("navigation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Выбрать язык" })).toBeVisible();
  const point = await emptyMapPoint(page);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x - 60, point.y + 35, { steps: 8 }); await page.mouse.up();
  await expect(map).toHaveAttribute("data-map-quiet", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.locator('[data-place-id="kul-sharif"]').click();
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  await card.dispatchEvent("pointerdown", { clientX: box.x + 80, clientY: box.y + 20, pointerType: "touch" });
  await card.dispatchEvent("pointerup", { clientX: box.x + 80, clientY: box.y + 100, pointerType: "touch" });
  await expect(card).not.toBeVisible();
  await page.locator('[data-place-id="kul-sharif"]').click();
  await page.getByRole("button", { name: "Закрыть карточку места" }).click();
  await expect(card).not.toBeVisible();
  expect((await page.locator(".maplibregl-canvas").boundingBox())!.height).toBe(canvasHeight);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("route errors remain readable and reduced motion disables panel movement", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-402");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await deterministicServices(page);
  await page.route("**/api/walking-route", route => route.fulfill({ status: 503, json: { error: "Нет сети. Новые пути рассчитываются онлайн." } }));
  await page.goto("/#/routes"); await page.locator(".theme-card").first().click();
  const peek = page.getByRole("button", { name: "Открыть сведения о маршруте" });
  await expect(peek).toContainText("Нет сети"); await peek.click();
  await expect(page.getByRole("dialog")).toContainText("Новые пути рассчитываются онлайн");
  await expect(page.getByRole("button", { name: "Повторить расчёт" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await tapMap(page);
  await expect(page.locator(".bottom-navigation")).toHaveCSS("transition-duration", "0s");
  await tapMap(page);
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("a chosen route stays on the map while its details collapse and restore", async ({ page }, info) => {
  await deterministicServices(page);
  await page.goto("/#/routes");
  await page.locator(".theme-card").first().click();
  await expect(page.locator("main.map-page")).toHaveAttribute("data-route-source", "foot");
  const peek = page.getByRole("button", { name: "Открыть сведения о маршруте" });
  await expect(peek).toBeVisible();
  expect((await peek.boundingBox())!.height).toBe(56);
  await expect(page.locator(".next-stop-card")).not.toBeVisible();
  await peek.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("мин пешком");
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await tapMap(page);
  await expect(peek).not.toBeVisible();
  await expect(page.locator("main.map-page")).toHaveAttribute("data-route-source", "foot");
  await tapMap(page);
  await expect(peek).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.screenshot({ path: `test-results/screenshots/map-route-${info.project.name}.png` });
});
