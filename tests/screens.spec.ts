import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { deterministicServices } from "./services";
test.beforeEach(async ({ page }) => deterministicServices(page));

const screens = ["home", "map", "place/ushkova", "player/ushkova", "zilant", "dialog", "waiting", "profile", "routes"];
const geometry: Record<string, [string, number][]> = {
  map: [[".next-stop-card", 562]],
  "place/ushkova": [[".place-sheet", 315], [".place-sheet h1", 380]],
  "player/ushkova": [[".audio-cover", 136], [".player-caption", 503]],
  zilant: [[".chat-header", 61], [".greeting-figure", 128], [".greeting-title", 364], [".chat-composer", 680]],
  waiting: [[".question-bubble", 153], [".waiting-figure", 275], [".waiting-status", 551], [".stop-request", 628], [".chat-composer", 680]],
  profile: [[".traveler-card", 163], [".awards-card", 280], [".profile-sections", 500]],
  routes: [[".themes-gallery", 227], [".route-zilant-cta", 610]],
};

test("all nine Figma screens: assets, SVG proportions, layout and screenshots", async ({ page, browserName }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  let takingScreenshot = false;
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on("console", message => {
    if (message.type() !== "error") return;
    // WebKit's screenshot helper injects its own stylesheet. A strict production
    // CSP rejects that helper, even with caret:'initial'. A no-screenshot probe
    // verified zero app errors; keep CSP intact and allow only this exact helper
    // warning while taking a screenshot. All app-time CSP violations still fail.
    if (browserName === "webkit" && takingScreenshot && message.text() === "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.") return;
    errors.push(message.text());
  });
  await mkdir("test-results/screenshots", { recursive: true });
  for (const screen of screens) {
    await page.goto(`/#/${screen}`);
    await expect(page.locator("main[data-figma-node], main.home-page")).toBeVisible();
    if (screen === "map") await expect(page.locator("[data-place-id]")).toHaveCount(20);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => image.decode())); });
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      animations: document.getAnimations().length,
      badImages: Array.from(document.images).filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
      badSvgGeometry: Array.from(document.images).filter(image => {
        if (!image.src.endsWith(".svg")) return false;
        const rect = image.getBoundingClientRect();
        const w = Number(image.getAttribute("width")), h = Number(image.getAttribute("height"));
        return w > 0 && h > 0 && Math.abs(rect.width / w - rect.height / h) > .025;
      }).map(image => image.dataset.asset ?? image.src),
    }));
    expect(result, screen).toEqual({ overflow: false, animations: 0, badImages: [], badSvgGeometry: [] });
    if (info.project.name === "desktop") {
      const shell = (await page.locator(".app-shell").boundingBox())!;
      expect(shell.width).toBe(402);
      if (screen !== "place/ushkova" && screen !== "player/ushkova") {
        const nav = (await page.getByRole("navigation").boundingBox())!;
        expect(nav.y - shell.y, `${screen} bottom navigation`).toBe(766);
      }
      for (const [selector, y] of geometry[screen] ?? []) {
        const rect = (await page.locator(selector).boundingBox())!;
        expect(Math.abs(rect.y - shell.y - y), `${screen} ${selector}: expected y=${y}, actual ${rect.y - shell.y}`).toBeLessThan(2);
      }
    }
    takingScreenshot = true;
    try { await page.screenshot({ path: `test-results/screenshots/${screen.replace("/", "-")}-${info.project.name}.png`, fullPage: true }); }
    finally { takingScreenshot = false; }
  }
  expect(errors).toEqual([]);
});

test("server-backed favorites and visits, saved position, cancelled request and route card", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Начать прогулку", exact: true }).click();
  await expect(page.getByLabel("Поиск места")).toBeVisible();
  await page.getByLabel("Поиск места").fill("Ушковой");
  await page.locator(".map-search-results").getByRole("button", { name: "Дом Ушковой" }).click();
  await expect(page.getByRole("heading", { name: "Дом Ушковой" })).toBeVisible();
  await page.getByRole("button", { name: "Добавить в избранное" }).click();
  await page.getByRole("button", { name: "Я здесь", exact: true }).click();
  await page.waitForResponse(r => r.url().endsWith("/api/progress") && r.request().method() === "PUT" && r.ok());
  await page.reload();
  await expect(page.getByRole("button", { name: "Убрать из избранного" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Посещение отмечено" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Аудио скоро · открыть плеер" }).click();
  await expect(page.getByRole("slider", { name: "Позиция аудиоистории" })).toHaveValue("0");
  await page.getByRole("button", { name: "Вперёд на 15 секунд" }).click();
  await page.waitForResponse(r => r.url().endsWith("/api/progress") && r.request().method() === "PUT" && r.ok());
  await page.reload();
  await expect(page.getByRole("slider", { name: "Позиция аудиоистории" })).toHaveValue("15");
  await page.getByRole("button", { name: "Воспроизвести историю" }).click();
  await expect(page.getByRole("status")).toContainText("аудиозапись ещё не добавлена");
  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Избранное", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Дом Ушковой" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть окно" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Зилант", exact: true }).click();
  await page.getByRole("button", { name: "Куда пойти на час?" }).click();
  await expect(page.getByRole("heading", { name: "Собираю прогулку…" })).toBeVisible();
  await page.getByRole("button", { name: "Остановить", exact: true }).click();
  await expect(page.locator(".greeting-title")).toBeVisible();
  await page.getByRole("button", { name: "Куда пойти на час?" }).click();
  await expect(page.locator(".chat-route-card")).toBeVisible();
  await expect(page.locator(".answer-bubble")).toContainText("Дому Ушковой");
  await page.getByRole("button", { name: "На карте", exact: true }).click();
  await expect(page.locator("main.map-page")).toHaveAttribute("data-route-source", "foot");
  await page.goto("/#/routes");
  await expect(page.getByRole("heading", { name: "Маршруты", exact: true })).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Следующая тема прогулки" }).click();
  await page.getByRole("button", { name: "Подобрать с Зилантом" }).click();
  await expect(page.locator(".greeting-title")).toBeVisible();
});
