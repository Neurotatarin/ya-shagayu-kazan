import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { deterministicServices } from "./services";
declare global { interface Window { languageAudio: HTMLMediaElement[] } }

const catalog = JSON.parse(readFileSync(new URL("../server/catalog.json", import.meta.url), "utf8"));
const labels = { ru: "Русский", en: "English", ar: "العربية" };
async function choose(page: Page, language: keyof typeof labels) {
  const url = page.url();
  await page.locator(".language-trigger").click();
  await page.locator(".language-option").filter({ has: page.locator(`[lang="${language}"]`) }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  await expect(page).toHaveURL(url);
}

test.beforeEach(async ({ page }) => {
  await deterministicServices(page);
  // These UI tests use an isolated progress service. Actual guest isolation,
  // validation and old-client compatibility are verified by Python API tests.
  let progress = { favorites: [], positions: {}, visited: [] };
  await page.route("**/api/guest", route => route.fulfill({ json: { token: "language-ui-fixture" } }));
  await page.route("**/api/progress", async route => {
    if (route.request().method() === "PUT") progress = route.request().postDataJSON();
    await route.fulfill({ json: progress });
  });
});

test("English and Arabic persist across all screens without changing the route or overflowing", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  for (const language of ["en", "ar"] as const) {
    await choose(page, language);
    await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
    for (const screen of ["home", "map", "place/kremlin", "player/kremlin", "zilant", "dialog", "waiting", "profile", "routes"]) {
      await page.goto(`/#/${screen}`);
      await expect(page.locator("main[data-figma-node],main.home-page")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(".language-trigger")).toHaveText(language.toUpperCase());
      const layout = await page.evaluate(() => {
        const control = document.querySelector(".language-trigger")!.getBoundingClientRect();
        const headingNode = document.querySelector(".profile-page > h1,.routes-page > h1");
        const textRange = document.createRange(); if (headingNode) textRange.selectNodeContents(headingNode);
        const heading = headingNode && textRange.getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, headingOverlap: heading && control.left < heading.right && control.right > heading.left && control.top < heading.bottom && control.bottom > heading.top,
          clippedLabels: [...document.querySelectorAll(".nav-label,.language-trigger span")].filter(element => element.scrollWidth > element.clientWidth + 1).length,
          font: getComputedStyle(document.querySelector("main")!).fontFamily };
      });
      expect(layout.overflow, screen).toBe(false);
      expect(!!layout.headingOverlap, screen).toBe(false);
      expect(layout.clippedLabels, screen).toBe(0);
      if (language === "ar") expect(layout.font).toContain("Noto Sans Arabic");
      if (screen.startsWith("player")) {
        await expect(page.locator(".play-action")).toBeDisabled();
        await expect(page.locator("#audio-availability")).toHaveText(language === "en" ? "Audio in this language is coming soon" : "التسجيل بهذه اللغة قيد الإعداد");
      }
    }
  }
  await choose(page, "ru");
  await page.goto("/#/home");
  await expect(page.locator(".home-title")).toHaveText("Город ждёт.");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator(".home-title")).toHaveCSS("font-family", /Tenor Sans/);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/languages-${info.project.name}.png`, fullPage: true });
});

// Existing MP3s are transport fixtures for selecting three distinct URLs.
// They are NOT translations, and this catalogue override is test-only. Windows
// WebKit's native media pipeline cannot use page.route audio responses.
const transportTracks = { ru: "kremlin", en: "ushkova", ar: "kul-sharif" };
async function audioFixture(page: Page, foreign: boolean) {
  const data = structuredClone(catalog);
  const place = data.places.find((place: { id: string }) => place.id === "kremlin");
  delete place.galleryUrl;
  place.audioTracks = Object.fromEntries((foreign ? ["ru", "en", "ar"] as const : ["ru"] as const).map(language => { const track = data.places.find((p: {id: string}) => p.id === transportTracks[language]); return [language, { url: track.audioUrl, durationSeconds: track.durationSeconds }]; }));
  await page.route("**/api/catalog", route => route.fulfill({ json: data }));
  await page.addInitScript(() => {
    window.languageAudio = [];
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { const elements = window.languageAudio; if (!elements.includes(this)) elements.push(this); return original.call(this); };
  });
}

test("changing language stops Russian audio and never plays it as a fallback", async ({ page }, info) => {
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name), "Media engines are checked in Chromium and WebKit.");
  await audioFixture(page, false);
  await page.goto("/#/player/kremlin");
  await page.locator(".play-action").click();
  await expect.poll(async () => Number(await page.getByRole("slider").inputValue()), {timeout: 20000}).toBeGreaterThan(0);
  await choose(page, "en");
  await expect(page.locator(".play-action")).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.languageAudio.every(audio => audio.paused))).toBe(true);
  await expect(page.getByRole("slider")).toBeDisabled();
  await page.getByRole("button", { name: "Offline", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("Coming soon");
  await choose(page, "ar");
  await expect(page.locator(".play-action")).toBeDisabled();
  await expect(page.locator(".notice")).toContainText("قريباً");
});

test("available language tracks use their own URLs, durations and saved positions", async ({ page }, info) => {
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name), "Media engines are checked in Chromium and WebKit.");
  await audioFixture(page, true);
  await page.goto("/#/player/kremlin");
  for (const [language, position] of [["ru", 2], ["en", 4], ["ar", 6]] as const) {
    if (language !== "ru") await choose(page, language);
    await expect(page.getByRole("slider")).toHaveValue("0");
    await expect(page.getByRole("slider")).toHaveAttribute("max", String(catalog.places.find((p: {id: string}) => p.id === transportTracks[language]).durationSeconds));
    await page.locator(".play-action").click();
    await expect.poll(() => page.evaluate(() => window.languageAudio.some(audio => !audio.paused && audio.currentTime > 0)), {timeout:20000}).toBe(true);
    expect(await page.evaluate(() => window.languageAudio.find(audio => !audio.paused)?.currentSrc)).toContain(catalog.places.find((p: {id: string}) => p.id === transportTracks[language]).audioUrl);
    await page.locator(".play-action").click();
    await page.getByRole("slider").fill(String(position));
  }
  for (const [language, position] of [["ru", 2], ["en", 4], ["ar", 6]] as const) {
    await choose(page, language);
    await expect(page.getByRole("slider")).toHaveValue(String(position));
  }
  await page.reload();
  await expect(page.getByRole("slider")).toHaveValue("6");
});
