import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const walkingRoute = JSON.parse(readFileSync(new URL("./fixtures/walking-route.json", import.meta.url), "utf8"));

// Deterministic UI checks do not spend OpenAI credits or load public map tiles.
// Live provider checks are run separately against the deployed HTTPS version.
export async function deterministicServices(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f0f7f2" } }] } }));
  await page.route("**/api/walking-route", route => route.fulfill({ json: walkingRoute }));
  await page.route("**/api/chat", async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    try { await route.fulfill({ json: { message: "Начни с Кремля, затем прогуляйся по Кремлёвской улице к Дому Ушковой. На карте покажу пешеходный путь.", routeTitle: "Кремль и Дом Ушковой", placeIds: ["kremlin", "ushkova"], model: "test-fixture" } }); } catch { /* The cancellation scenario intentionally aborts one request. */ }
  });
}
