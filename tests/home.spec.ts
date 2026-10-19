import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
test("home layout, local resource loading and working navigation", async ({
  page,
  browserName,
}, testInfo) => {
  const errors: string[] = [];
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      consoleMessages.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Город ждёт." }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await mkdir("test-results/screenshots", { recursive: true });
  const fontDiagnostics = await page.evaluate(() => ({
    heading: getComputedStyle(document.querySelector("h1")!).fontFamily,
    faces: Array.from(document.fonts)
      .filter((font) => font.status === "loaded")
      .map((font) => ({
        family: font.family,
        unicodeRange: font.unicodeRange,
      })),
  }));
  let platformFonts: {
    familyName: string;
    isCustomFont: boolean;
    glyphCount: number;
  }[] = [];
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const { root } = await session.send("DOM.getDocument");
    const { nodeId } = await session.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: "h1",
    });
    ({ fonts: platformFonts } = await session.send(
      "CSS.getPlatformFontsForNode",
      { nodeId },
    ));
    await session.detach();
  }
  await writeFile(
    `test-results/fonts-${testInfo.project.name}.json`,
    JSON.stringify(
      { fontDiagnostics, platformFonts, consoleMessages },
      null,
      2,
    ),
  );
  if (browserName === "chromium") {
    expect(
      platformFonts.some(
        (font) =>
          font.isCustomFont &&
          font.familyName === "Tenor Sans" &&
          font.glyphCount >= 8,
      ),
    ).toBe(true);
  }
  const loadedResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((resource) => resource.name),
  );
  for (const font of ["tenor-sans-cyrillic-400", "onest-cyrillic-400"]) {
    expect(loadedResources.some((url) => url.includes(font))).toBe(true);
  }
  await expect(
    page.getByRole("navigation", { name: "Основная навигация" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      Array.from(document.images).every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    ),
  ).toBe(true);
  if (testInfo.project.name === "desktop") {
    const bounds = await page.locator(".app-shell").boundingBox();
    expect(bounds?.width).toBe(402);
    expect(Math.abs(bounds!.x + bounds!.width / 2 - 720)).toBeLessThan(1);
  }
  await mkdir("test-results/screenshots", { recursive: true });
  await page.screenshot({
    path: `test-results/screenshots/home-${testInfo.project.name}.png`,
  });
  await page
    .getByRole("button", { name: "Начать прогулку", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Раздел в разработке×");
  await page.getByRole("button", { name: "Закрыть сообщение" }).click();
  await expect(page.getByRole("status")).toBeEmpty();
  for (const name of ["Карта", "Зилант", "Маршруты", "Профиль"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Раздел в разработке");
    await expect(
      page.getByRole("heading", { name: "Город ждёт." }),
    ).toBeVisible();
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Главная", exact: true })
    .click();
  await expect(page.getByRole("status")).toBeEmpty();
  await page.getByRole("button", { name: "Открыть профиль" }).click();
  await expect(page.getByRole("status")).toContainText("Раздел в разработке");
  await page.getByRole("button", { name: "Все маршруты" }).click();
  await expect(page.getByRole("status")).toContainText("Раздел в разработке");
  await page.locator(".route-card").click();
  await expect(page.getByRole("status")).toContainText("Раздел в разработке");
  await page.getByRole("button", { name: "Закрыть сообщение" }).click();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const card = await page.locator(".route-card").boundingBox();
  const nav = await page.getByRole("navigation").boundingBox();
  expect(card!.y + card!.height).toBeLessThanOrEqual(nav!.y - 8);
  expect(
    await page.evaluate(() => Array.from(document.getAnimations()).length),
  ).toBe(0);
  expect(errors).toEqual([]);
});
