import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const walkingRoute = JSON.parse(readFileSync(new URL("./fixtures/walking-route.json", import.meta.url), "utf8"));

// Deterministic UI checks do not spend OpenAI credits or load public map tiles.
// Live provider checks are run separately against the deployed HTTPS version.
export async function deterministicServices(page: Page) {
  // Retain the deliberately missing-recording state independently of the live
  // catalog's two real MP3s. Real audio is covered in audio.spec.ts.
  await page.route("**/api/catalog", async route => {
    const response = await route.fetch();
    const data = await response.json();
    for (const place of data.places) { delete place.audioUrl; if (place.id === "ushkova") place.durationSeconds = 260; }
    await route.fulfill({ response, json: data });
  });
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f0f7f2" } }] } }));
  await page.route("**/api/walking-route", route => route.fulfill({ json: walkingRoute }));
  await page.route("**/api/chat", async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    try { await route.fulfill({ json: { message: "Начни с Кремля, затем прогуляйся по Кремлёвской улице к Дому Ушковой. На карте покажу пешеходный путь.", routeTitle: "Кремль и Дом Ушковой", placeIds: ["kremlin", "ushkova"], model: "test-fixture" } }); } catch { /* The cancellation scenario intentionally aborts one request. */ }
  });
}
