import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { deterministicServices } from "./services";

declare global { interface Window { miniAudio: HTMLMediaElement[] } }

// A real, decodable 60-second media fixture keeps interaction checks independent
// of the remote MP3 host. Original recordings are checked separately over HTTPS.
const wave = Buffer.alloc(44 + 8000 * 60, 128);
wave.write("RIFF", 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write("WAVEfmt ", 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(8000, 28); wave.writeUInt16LE(1, 32); wave.writeUInt16LE(8, 34);
wave.write("data", 36); wave.writeUInt32LE(wave.length - 44, 40);
const catalog = JSON.parse(readFileSync(new URL("../server/catalog.json", import.meta.url), "utf8"));

async function fixtures(page: Page) {
  await page.addInitScript(() => {
    window.miniAudio = [];
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (!window.miniAudio.includes(this)) window.miniAudio.push(this); return original.call(this); };
  });
  await deterministicServices(page, { keepAudio: true });
  await page.route("**/api/catalog", route => route.fulfill({ json: catalog }));
  let progress = { favorites: [], visited: [], positions: {} };
  await page.route("**/api/guest", route => route.fulfill({ json: { token: "mini-player-test-session" } }));
  await page.route("**/api/progress", route => {
    if (route.request().method() === "PUT") progress = route.request().postDataJSON();
    return route.fulfill({ json: progress });
  });
  await page.route("**/media/**.json", route => route.fulfill({ json: { items: [1, 2, 3].map(i => ({ url: `/media/test-photo-${i}.jpg`, width: 800, height: 600, caption: `Фото ${i}`, sourceUrl: "https://commons.wikimedia.org/", license: "CC0", author: "Test" })) } }));
  await page.route("**/media/test-photo-*.jpg", route => route.fulfill({ path: "app/public/assets/home/kremlin.jpg", contentType: "image/jpeg" }));
  await page.route("**/media/**.mp3", route => {
    const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0, end = Math.min(range?.[2] ? Number(range[2]) : wave.length - 1, wave.length - 1);
    return route.fulfill({ status: range ? 206 : 200, body: wave.subarray(start, end + 1), contentType: "audio/wav", headers: { "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${end}/${wave.length}` } : {}) } });
  });
}
const switchTo = (page: Page, hash: string) => page.evaluate(value => { location.hash = value; }, hash);

test("mini-player controls the same audio everywhere, restores photos and closes without losing position", async ({ page }, info) => {
  test.setTimeout(60000);
  await fixtures(page);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/#/player/ushkova");
  await page.getByRole("button", { name: "Следующее фото", exact: true }).click();
  await page.getByRole("button", { name: "Следующее фото", exact: true }).click();
  await expect(page.locator(".cover-chapter")).toHaveAttribute("aria-label", "Кадр 3 из 4");
  await page.getByRole("button", { name: "Воспроизвести историю" }).click();
  const slider = page.getByRole("slider", { name: "Позиция аудиоистории" });
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0);
  await slider.fill("17");
  await page.getByRole("button", { name: "Назад к месту" }).click();
  const mini = page.getByRole("complementary", { name: "Мини-плеер экскурсии" });
  await expect(mini).toBeVisible();
  await mini.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect(mini).toContainText("На паузе");
  await mini.getByRole("button", { name: "Воспроизвести историю" }).click();
  for (const destination of ["home", "routes", "profile", "zilant", "map", "place/kremlin", "player/kremlin"]) {
    await switchTo(page, `/${destination}`);
    await expect(mini).toBeVisible();
    await expect(mini.locator(".mini-player-title")).toHaveText("Дом Ушковой");
    const box = (await mini.boundingBox())!;
    expect(box.height).toBe(80);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    if (!["place/kremlin", "player/kremlin"].includes(destination)) {
      const nav = (await page.getByRole("navigation").boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
    }
    if (destination === "map") {
      const card = (await page.locator(".next-stop-card").boundingBox())!;
      expect(card.y + card.height).toBeLessThanOrEqual(box.y);
    }
    if (["home", "map"].includes(destination)) await page.screenshot({ path: `test-results/screenshots/mini-${destination}-${info.project.name}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await mini.getByRole("button", { name: /^Вернуться к экскурсии:/ }).click();
  await expect(mini).toHaveCount(0);
  await expect(page.locator(".cover-chapter")).toHaveAttribute("aria-label", "Кадр 3 из 4");
  await expect(slider).not.toHaveValue("0");
  await page.getByRole("button", { name: "Музыкальный фон" }).click();
  await page.getByRole("button", { name: "Назад к месту" }).click();
  await mini.getByRole("button", { name: "Пауза", exact: true }).click();
  await mini.getByRole("button", { name: /^Вернуться к экскурсии:/ }).click();
  const saved = Number(await slider.inputValue());
  await page.getByRole("button", { name: "Назад к месту" }).click();
  await mini.getByRole("button", { name: "Закрыть экскурсию" }).click();
  await expect(mini).toHaveCount(0);
  if (await page.evaluate(() => typeof AudioContext !== "undefined")) expect(await page.evaluate(() => window.miniAudio.some(audio => audio.hasAttribute("data-kazan-background")))).toBe(true);
  expect(await page.evaluate(() => window.miniAudio.every(audio => audio.paused))).toBe(true);
  await switchTo(page, "/player/ushkova");
  await expect(slider).toHaveValue(String(saved));
  await page.reload();
  await expect(slider).toHaveValue(String(saved));
  await expect(page.locator(".cover-chapter")).toHaveAttribute("aria-label", "Кадр 3 из 4");
  await expect(page.getByRole("button", { name: "Воспроизвести историю" })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/screenshots/mini-return-${info.project.name}.png`, fullPage: true });
});

test("mini-player follows English and Arabic tracks and clears on language change", async ({ page }, info) => {
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name));
  await fixtures(page);
  for (const [code, title] of [["EN", "Tour mini-player"], ["AR", "مشغل الجولة المصغر"]]) {
    await page.goto("/#/player/kremlin");
    await page.locator(".language-trigger").click();
    await page.locator(".language-option").filter({ has: page.locator(`[lang="${code.toLowerCase()}"]`) }).click();
    await page.locator(".play-action").click();
    await expect(page.locator(".play-action")).toHaveAttribute("aria-label", code === "EN" ? "Pause" : "إيقاف مؤقت");
    await switchTo(page, "/home");
    await expect(page.getByRole("complementary", { name: title })).toBeVisible();
    await expect(page.locator(".mini-player-title")).not.toContainText("Кремль");
    await page.locator(".language-trigger").click();
    await page.locator(".language-option").filter({ has: page.locator('[lang="ru"]') }).click();
    await expect(page.locator(".mini-player")).toHaveCount(0);
  }
});

test("a failed or pending recording can be closed from another screen, and retry works", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-402", "Network interception of the native Windows WebKit media pipeline is unreliable; failure injection is checked in Chromium.");
  await fixtures(page);
  let mode: "error" | "pending" | "ok" = "error";
  let release: (() => void) | undefined;
  await page.route("**/media/**.mp3", async route => {
    if (mode === "error") return route.abort();
    if (mode === "pending") await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ body: wave, contentType: "audio/wav" }).catch(() => {});
  });
  await page.goto("/#/player/ushkova");
  await page.locator(".play-action").click();
  await switchTo(page, "/home");
  const mini = page.locator(".mini-player");
  await expect(mini).toContainText("Повторить загрузку");
  mode = "ok";
  await mini.locator(".mini-player-toggle").click();
  await expect.poll(() => page.evaluate(() => window.miniAudio.some(audio => !audio.paused && audio.currentTime > 0))).toBe(true);
  await mini.locator(".mini-player-close").click();
  await expect(mini).toHaveCount(0);
  expect(await page.evaluate(() => window.miniAudio.every(audio => audio.paused))).toBe(true);
  await switchTo(page, "/player/kremlin");
  mode = "pending";
  await page.locator(".play-action").click();
  await switchTo(page, "/profile");
  await expect(mini).toContainText("Загружаем запись…");
  await mini.locator(".mini-player-close").click();
  release?.();
  await expect(mini).toHaveCount(0);
  expect(await page.evaluate(() => window.miniAudio.every(audio => audio.paused))).toBe(true);
});
