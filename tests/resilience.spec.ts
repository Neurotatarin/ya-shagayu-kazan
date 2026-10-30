import { expect, test } from "@playwright/test";
import { deterministicServices } from "./services";

test("unacknowledged progress survives reload and replaces an expired guest session", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-402", "One service resilience check is sufficient.");
  await deterministicServices(page);
  await page.addInitScript(() => {
    localStorage.setItem("kazan:guest:token:v1", "expired-test-token");
    localStorage.setItem("kazan:design-preview:progress:v1", JSON.stringify({ favorites: ["ushkova"], visited: ["ushkova"], positions: { ushkova: 37 } }));
    localStorage.setItem("kazan:progress:pending:v1", "1");
  });
  await page.goto("/#/player/ushkova");
  await expect(page.getByRole("slider", { name: "Позиция аудиоистории" })).toHaveValue("37");
  const saved = await page.waitForResponse(response => response.url().endsWith("/api/progress") && response.request().method() === "PUT" && response.ok());
  expect((await saved.json()).positions.ushkova).toBe(37);
  expect(await page.evaluate(() => localStorage.getItem("kazan:guest:token:v1"))).not.toBe("expired-test-token");
});

test("GPS outside Kazan does not create a route from substituted coordinates", async ({ page, context }, info) => {
  test.skip(info.project.name !== "phone-402", "Geolocation contract is independent of viewport.");
  await deterministicServices(page);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 37.6176, latitude: 55.7558 });
  const requests: unknown[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/walking-route")) requests.push(request.postDataJSON()); });
  await page.goto("/#/map");
  await expect(page.locator("main.map-page")).toHaveAttribute("data-map-ready", "true");
  await page.getByRole("button", { name: "Моё местоположение" }).click();
  await expect(page.locator(".notice-region")).toContainText("вне Казани");
  await page.getByRole("button", { name: "Идти к этому месту" }).click();
  await expect(page.locator(".notice-region")).toContainText("Путь от тебя доступен в Казани");
  expect(requests.every(request => !(request as { start?: unknown }).start)).toBe(true);
});
