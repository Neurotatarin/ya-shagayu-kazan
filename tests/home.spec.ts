import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("original assets, readable layout, navigation and no animation", async ({ page, context, browserName }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Город ждёт." })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(Array.from(document.images).map((image) => image.decode())));
  await expect(page.getByRole("img", { name: "Зилант приглашает на прогулку" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Казанский Кремль" })).toBeVisible();
  await expect(page.getByRole("navigation")).toBeVisible();

  const geometry = await page.evaluate(() => ({
    noOverflow: document.documentElement.scrollWidth <= innerWidth,
    imagesReady: Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0 && image.getAttribute("src")?.startsWith("/assets/home/")),
    fonts: Array.from(document.fonts).filter((font) => font.status === "loaded").map((font) => ({ family: font.family, range: font.unicodeRange })),
    animations: document.getAnimations().length,
  }));
  expect(geometry.noOverflow).toBe(true);
  expect(geometry.imagesReady).toBe(true);
  expect(geometry.animations).toBe(0);
  expect(geometry.fonts.some((font) => font.family.includes("Tenor Sans") && /400-45F/i.test(font.range))).toBe(true);
  expect(geometry.fonts.some((font) => font.family.includes("Onest") && /400-45F/i.test(font.range))).toBe(true);

  if (info.project.name === "desktop") {
    const shell = await page.locator(".app-shell").boundingBox();
    const hero = await page.locator(".welcome-scene").boundingBox();
    const route = await page.locator(".route-card").boundingBox();
    expect(shell!.width).toBe(402);
    expect(shell!.x + shell!.width / 2).toBe(720);
    expect(hero!.x - shell!.x).toBeCloseTo(17, 0);
    expect(hero!.y - shell!.y).toBeCloseTo(187, 0);
    expect(hero!.height).toBe(300);
    expect(route!.y - shell!.y).toBeCloseTo(556, 0);
  }
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const { root } = await session.send("DOM.getDocument");
    for (const selector of ["h1", ".route-title", ".welcome-scene h2", ".brand > span"]) {
      const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector });
      const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
      expect(fonts.some((font: { familyName: string; isCustomFont: boolean; glyphCount: number }) => font.familyName === "Tenor Sans" && font.isCustomFont && font.glyphCount >= 5)).toBe(true);
    }
    await session.detach();
  }
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({ path: `test-results/screenshots/home-${info.project.name}.png`, fullPage: true });

  await page.locator(".route-card").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const route = await page.locator(".route-card").boundingBox();
  const nav = await page.getByRole("navigation").boundingBox();
  expect(route!.y + route!.height).toBeLessThanOrEqual(nav!.y - 20);
  await page.getByRole("navigation").getByRole("button", { name: "Главная", exact: true }).click();
  await expect(page.getByRole("status")).toBeEmpty();
  await context.setOffline(true);
  await expect(page.getByRole("heading", { name: "Город ждёт." })).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
