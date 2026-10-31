import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync(new URL("../server/catalog.json", import.meta.url), "utf8"));
const walking = JSON.parse(readFileSync(new URL("./fixtures/walking-route.json", import.meta.url), "utf8"));
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS" };

// These checks exercise the real UI against a simulated native contract. They
// do not establish filesystem persistence, GPS or playback on an actual iPhone.
async function fixture(page: Page, native = true) {
  await page.route("**/api/**", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const path = new URL(route.request().url()).pathname;
    const json = path.endsWith("/catalog") ? catalog : path.endsWith("/guest") ? { token: "offline-ui-test" } : path.endsWith("/walking-route") ? { ...walking, placeIds: route.request().postDataJSON().placeIds } : { favorites: [], visited: [], positions: {} };
    return route.fulfill({ json, headers: cors });
  });
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f0f7f2" } }] } }));
  if (!native) return;
  await page.addInitScript(() => {
    type RecordValue = Record<string, any>;
    const win = window as unknown as RecordValue;
    win.CapacitorCustomPlatform = { name: "ios" };
    const events: Record<string, (value: RecordValue) => void> = {};
    const state: RecordValue = { ready: true, connected: localStorage.getItem("offline-ui-connected") !== "false", packages: JSON.parse(localStorage.getItem("offline-ui-packages") ?? "[]"), availableBytes: 1_000_000_000, error: "" };
    let pending: { plan: RecordValue; resolve: (value: unknown) => void; reject: (value: unknown) => void } | undefined;
    const reject = (code: string) => Object.assign(new Error("Sensitive details must stay hidden"), { code });
    const save = () => localStorage.setItem("offline-ui-packages", JSON.stringify(state.packages));
    win.offlineContract = {
      enoughSpace: true,
      progress: () => events.transferChange?.({ id: pending!.plan.id, phase: "downloading", completed: 7, total: pending!.plan.assets.length, bytes: 2_000_000 }),
      complete: () => {
        const { plan, resolve } = pending!;
        state.packages.push({ ...plan, bytes: 12_000_000, downloadedAt: new Date().toISOString(), files: Object.fromEntries(plan.assets.map((asset: RecordValue, index: number) => [asset.url, `file:///offline/${index}`])) });
        save(); pending = undefined; delete state.transfer;
        events.packagesChange?.({}); events.transferChange?.({ finished: true }); resolve({ saved: true });
      },
      fail: () => { pending!.reject(reject("OFFLINE_NETWORK")); pending = undefined; delete state.transfer; events.transferChange?.({ finished: true }); },
      network: (connected: boolean) => { state.connected = connected; localStorage.setItem("offline-ui-connected", String(connected)); events.networkChange?.({ connected }); },
    };
    win.Capacitor = {
      convertFileSrc: (file: string) => file.replace("file:///offline/", location.origin + "/offline-ui-file/"),
      PluginHeaders: [{ name: "KazanOffline", methods: ["getState", "fetchMetadata", "estimate", "download", "cancel", "remove", "addListener", "removeListener"].map(name => ({ name, rtype: name.endsWith("Listener") ? "callback" : "promise" })) }],
      nativeCallback: (_plugin: string, _method: string, options: { eventName: string }, callback: (data: RecordValue) => void) => { events[options.eventName] = callback; return options.eventName; },
      nativePromise: async (_plugin: string, method: string, options: RecordValue = {}) => {
        if (method === "getState") return structuredClone(state);
        if (method === "fetchMetadata") {
          if (options.url.endsWith("/styles/positron")) return { value: { version: 8, sources: { map: { type: "vector", url: "https://tiles.openfreemap.org/planet" } }, glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf", layers: [{ id: "labels", type: "symbol", source: "map", "source-layer": "place", layout: { "text-font": ["Noto Sans Regular"] } }] } };
          if (options.url.endsWith("/planet")) return { value: { tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 } };
          return { value: { items: [{ url: "/media/test-photo.webp", author: "Test author", license: "CC BY-SA 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/Test" }] } };
        }
        if (method === "estimate") return { upperBytes: 70_000_000, availableBytes: state.availableBytes, enoughSpace: win.offlineContract.enoughSpace };
        if (method === "download") {
          state.transfer = { id: options.plan.id, phase: "downloading", completed: 0, total: options.plan.assets.length, bytes: 0 };
          return new Promise((resolve, reject) => { pending = { plan: options.plan, resolve, reject }; });
        }
        if (method === "cancel") { pending?.reject(reject("OFFLINE_CANCELLED")); pending = undefined; delete state.transfer; events.transferChange?.({ finished: true }); return {}; }
        if (method === "remove") { state.packages = state.packages.filter((pack: RecordValue) => pack.id !== options.id); save(); events.packagesChange?.({}); return {}; }
        return {};
      },
    };
  });
}
const card = (page: Page) => page.locator(".offline-package-card");
async function openDownload(page: Page) {
  await page.goto("/#/player/ushkova");
  await page.locator(".offline-action").click();
  await expect(card(page)).toHaveAttribute("data-state", "Available");
}
async function contract(page: Page, method: "progress" | "complete" | "fail", value?: boolean) {
  await page.evaluate(({ method, value }) => (window as any).offlineContract[method](value), { method, value });
}

test("browser offline download is disabled in player and profile", async ({ page }) => {
  await fixture(page, false);
  await page.goto("/#/player/ushkova");
  await expect(page.locator(".offline-action")).toBeDisabled();
  await expect(page.locator(".offline-action")).toHaveAttribute("title", /установленном приложении iPhone/);
  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Офлайн-маршруты", exact: true }).click();
  await expect(card(page)).toHaveAttribute("data-state", "BrowserDisabled");
  await expect(card(page).getByRole("button")).toBeDisabled();
});

test("native UI cancellation, retry, persistent listing and removal never publish a partial package", async ({ page }, info) => {
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name));
  await fixture(page); await openDownload(page);
  await card(page).getByRole("button", { name: "Скачать на iPhone" }).click();
  await contract(page, "progress");
  await expect(card(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "7");
  await card(page).getByRole("button", { name: "Отменить загрузку" }).click();
  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Офлайн-маршруты", exact: true }).click();
  await expect(page.getByText("Скачанных маршрутов пока нет.")).toBeVisible();
  await openDownload(page);
  await card(page).getByRole("button", { name: "Скачать на iPhone" }).click();
  await contract(page, "fail");
  await expect(card(page)).toHaveAttribute("data-state", "Error");
  await expect(card(page)).not.toContainText("Sensitive details");
  await card(page).getByRole("button", { name: "Повторить" }).click();
  await expect(card(page)).toHaveAttribute("data-state", "Available");
  await card(page).getByRole("button", { name: "Скачать на iPhone" }).click();
  await contract(page, "complete");
  await expect(card(page)).toHaveAttribute("data-state", "Saved");
  await page.goto("/#/profile");
  await page.getByRole("button", { name: "Офлайн-маршруты", exact: true }).click();
  await expect(card(page)).toHaveAttribute("data-state", "Saved");
  await card(page).getByRole("button", { name: "Удалить с iPhone" }).click();
  await expect(page.getByText("Скачанных маршрутов пока нет.")).toBeVisible();
});

test("native sheet keeps Figma typography and reachable controls on small/large/RTL viewports", async ({ page }, info) => {
  await fixture(page);
  if (info.project.name === "desktop") await page.addInitScript(() => localStorage.setItem("kazan:language:v1", "ar"));
  await page.goto("/#/player/ushkova");
  await page.evaluate(() => { (window as any).offlineContract.enoughSpace = false; });
  await page.locator(".offline-action").click();
  await expect(card(page)).toHaveAttribute("data-state", "Error");
  await expect(card(page)).toContainText(info.project.name === "desktop" ? "200" : "200 МБ");
  await expect(card(page).locator(".offline-card-action")).toBeEnabled();
  await page.evaluate(() => { (window as any).offlineContract.enoughSpace = true; });
  await card(page).locator(".offline-card-action").click();
  await expect(card(page)).toHaveAttribute("data-state", "Available");
  await expect(card(page)).toHaveCSS("border-radius", "30px");
  await expect(card(page)).toHaveCSS("padding", "24px");
  await expect(card(page)).toHaveCSS("font-size", "14px");
  const action = card(page).locator(".offline-card-action");
  const bounds = (await action.boundingBox())!, view = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(view.width);
  expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(view.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath(`offline-${info.project.name}.png`) });
});

test("whole-route download preserves exact stops and walking geometry", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-402");
  await fixture(page);
  await page.goto("/#/routes");
  await page.locator(".theme-tatar").click();
  await expect(page.locator(".map-page")).toHaveAttribute("data-route-source", "foot");
  await page.getByRole("button", { name: "Открыть сведения о маршруте" }).click();
  await page.getByRole("button", { name: "Скачать маршрут на iPhone" }).click();
  await expect(card(page)).toHaveAttribute("data-state", "Available");
  await card(page).getByRole("button", { name: "Скачать на iPhone" }).click();
  await contract(page, "complete");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("offline-ui-packages")!)[0]);
  expect(saved.placeIds.length).toBe(5);
  expect(saved.route.placeIds).toEqual(saved.placeIds);
  expect(saved.route.geometry).toEqual(walking.geometry);
});

test("native saved catalog survives a cold reload without browser catalog cache; missing translations stay unavailable", async ({ page }, info) => {
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name));
  await fixture(page); await openDownload(page);
  await card(page).getByRole("button", { name: "Скачать на iPhone" }).click();
  await contract(page, "complete");
  await expect(card(page)).toHaveAttribute("data-state", "Saved");
  await page.evaluate(() => { localStorage.removeItem("kazan:catalog:v1"); (window as any).offlineContract.network(false); });
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/")) requests.push(request.url()); });
  await page.reload();
  await expect(page.locator(".player-page h1")).toHaveText("Дом Ушковой");
  await expect(page.getByRole("button", { name: "Воспроизвести историю" })).toBeEnabled();
  await expect(page.locator(".offline-action")).toHaveText("Скачано");
  expect(requests).toEqual([]);
  await page.evaluate(() => localStorage.setItem("kazan:language:v1", "en"));
  await page.reload();
  await expect(page.getByRole("button", { name: "Play story", exact: true })).toBeDisabled();
  await expect(page.locator("#audio-availability")).toContainText("coming soon");
  expect(requests).toEqual([]);
});
