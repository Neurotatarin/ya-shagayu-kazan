import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(readFileSync(new URL("../server/catalog.json", import.meta.url), "utf8"));
test("Android shell keeps navigation inside narrow and centered wide windows", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-402", "One Chromium check; real Android bridge is tested in instrumentation.");
  await page.route("**/api/**", route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("catalog") ? catalog : new URL(route.request().url()).pathname.endsWith("guest") ? { token: "geometry-test" } : { favorites: [], visited: [], positions: {} }, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS" } }));
  await page.addInitScript(() => {
    const host = window as unknown as Record<string, unknown>;
    host.CapacitorCustomPlatform = { name: "android" };
    host.Capacitor = {
      PluginHeaders: ["KazanOffline", "KazanAudio"].map(name => ({ name, methods: ["getState", "addListener", "removeListener"].map(name => ({ name, rtype: name.endsWith("Listener") ? "callback" : "promise" })) })),
      nativeCallback: () => "geometry-listener",
      nativePromise: async (plugin: string) => plugin === "KazanOffline" ? { ready: true, connected: true, packages: [], error: "" } : { placeId: "", position: 0, duration: 0, playing: false, loading: false, speed: 1, error: "", backgroundEnabled: false, backgroundPlaying: false, backgroundError: "" },
    };
  });
  for (const [width, height] of [[320, 568], [393, 852], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height }); await page.goto("/");
    await expect(page.locator(".home-page")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-native-shell", "android");
    const shell = (await page.locator(".app-shell").boundingBox())!, nav = (await page.getByRole("navigation").boundingBox())!;
    expect(shell.width).toBe(width >= 768 ? 402 : width);
    expect(Math.abs(shell.x + shell.width / 2 - width / 2)).toBeLessThan(1);
    expect(nav.y).toBeGreaterThanOrEqual(0); expect(nav.y + nav.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  }
});
