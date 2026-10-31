import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync(new URL("../server/catalog.json", import.meta.url), "utf8"));
const walkingRoute = JSON.parse(readFileSync(new URL("./fixtures/walking-route.json", import.meta.url), "utf8"));
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS" };

test.beforeEach(async ({ page }, info) => {
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name), "Native-shell contracts are checked in Chromium and desktop WebKit, not a physical iPhone.");
  await page.route("**/api/**", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const path = new URL(route.request().url()).pathname;
    const data = structuredClone(catalog);
    const place = data.places.find((p: { id: string }) => p.id === "ushkova");
    place.audioTracks = { ru: { url: "/media/test.mp3", durationSeconds: 100 } };
    const json = path.endsWith("/catalog") ? data : path.endsWith("/guest") ? { token: "native-contract-test" } : path.endsWith("/chat") ? { message: "Прогуляйся от Кремля к Дому Ушковой.", placeIds: ["kremlin", "ushkova"], routeTitle: "Короткая прогулка" } : path.endsWith("/walking-route") ? walkingRoute : { favorites: [], visited: [], positions: {} };
    return route.fulfill({ json, headers: cors });
  });
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f0f7f2" } }] } }));
});

async function iosShell(page: Page, sessionError = false) {
  await page.addInitScript(({ sessionError }) => {
    const win = window as unknown as Record<string, unknown>;
    win.CapacitorCustomPlatform = { name: "ios" };
    if (sessionError) {
      const state = { placeId: "", position: 0, duration: 100, playing: false, loading: false, speed: 1, error: "", backgroundEnabled: false, backgroundPlaying: false, backgroundError: "" };
      win.Capacitor = {
        PluginHeaders: [{ name: "KazanAudio", methods: ["getState", "loadTrack", "play", "addListener", "removeListener"].map(name => ({ name, rtype: name.endsWith("Listener") ? "callback" : "promise" })) }],
        nativeCallback: () => "contract-listener",
        nativePromise: async (_plugin: string, method: string, options: { id?: string }) => {
          if (method === "play") throw Object.assign(new Error("Private error details must not be displayed"), { code: "AUDIO_SESSION_-50" });
          if (method === "loadTrack") state.placeId = options.id ?? "";
          return { ...state };
        },
      };
    }
  }, { sessionError });
}

test("installed frame keeps original typography and reachable navigation after composing and changing screens", async ({ page }) => {
  await iosShell(page);
  await page.goto("/#/zilant");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /maximum-scale=1/);
  const input = page.getByRole("textbox", { name: "Сообщение Зиланту" });
  await expect(input).toHaveCSS("font-size", "14px");
  await input.fill("Прогулка от Кремля к Дому Ушковой");
  await input.press("Enter");
  await expect(page.locator(".chat-route-card")).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
  await page.getByRole("button", { name: "На карте", exact: true }).click();
  await expect(page.locator(".map-page")).toHaveAttribute("data-route-source", "foot");
  await expect(page.getByRole("navigation")).toBeVisible();
  const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
  for (let i = 0; i < 2; i++) await page.mouse.click(box.x + box.width * .65, box.y + box.height * .4);
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("button", { name: "Главная", exact: true }).click();
  await expect(page.locator(".home-page")).toBeVisible();
  const nav = (await page.getByRole("navigation").boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(nav.y).toBeGreaterThanOrEqual(0);
  expect(nav.y + nav.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => ({ horizontal: document.documentElement.scrollWidth > innerWidth, outerScrollable: document.documentElement.scrollHeight > innerHeight + 1 }))).toEqual({ horizontal: false, outerScrollable: false });
});

test("browser retains its scalable viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute("content", /maximum-scale|user-scalable/);
  await expect(page.locator("html")).not.toHaveAttribute("data-native-shell", "ios");
});

test("route to place to failed player and back repeatedly restores the map and direct listen skips the full place", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await iosShell(page);
  await page.goto("/#/routes");
  await page.locator(".theme-tatar").click();
  for (let i = 0; i < 3; i++) {
    await expect(page.locator(".map-page")).toHaveAttribute("data-route-source", "foot");
    await page.locator('[data-place-id="ushkova"]').click();
    if (i === 1) await page.locator(".listen-next-stop").click();
    else {
      await page.locator(".next-stop-copy").click();
      await page.getByRole("button", { name: /Слушать историю/ }).click();
    }
    await expect(page.locator(".player-page")).toBeVisible();
    await page.locator(".player-page").getByRole("button", { name: "Воспроизвести историю" }).click();
    await expect(page.locator(".notice")).toContainText("AUDIO_BRIDGE_UNAVAILABLE");
    await page.getByRole("button", { name: "Назад к месту" }).click();
    await page.getByRole("button", { name: "Назад к карте" }).click();
    await expect(page.locator(".map-page")).toHaveAttribute("data-map-ready", "true");
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
    expect((await page.locator(".maplibregl-canvas").boundingBox())!.height).toBeGreaterThan(500);
  }
  expect(errors).toEqual([]);
});

for (const sessionError of [false, true]) test(`native rejection is reportable without private error text: ${sessionError ? "audio session" : "missing bridge"}`, async ({ page }) => {
  await iosShell(page, sessionError);
  await page.goto("/#/player/ushkova");
  await page.locator(".player-page").getByRole("button", { name: "Воспроизвести историю" }).click();
  await expect(page.locator(".notice")).toContainText(sessionError ? "AUDIO_SESSION_-50" : "AUDIO_BRIDGE_UNAVAILABLE");
  await expect(page.locator(".notice")).not.toContainText("Private error");
});

test("a failed lazy screen shows the existing retry state and can recover to home", async ({ page }) => {
  await page.route("**/assets/MapPage-*.js", route => route.fulfill({ status: 503, contentType: "text/javascript", headers: { "Cache-Control": "no-store" }, body: "" }));
  await page.goto("/#/map");
  await expect(page.getByRole("alert")).toContainText("Не получилось загрузить приложение");
  await page.unroute("**/assets/MapPage-*.js");
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator(".home-page")).toBeVisible();
});
