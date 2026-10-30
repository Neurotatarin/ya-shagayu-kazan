import { expect, test } from "@playwright/test";

test("background is opt-in, quiet, independent of voice speed and follows narration pause", async ({ page }, info) => {
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name), "Check mixing in Chromium and WebKit.");
  test.setTimeout(60000);
  await page.addInitScript(() => {
    const observed = window as typeof window & { media: HTMLMediaElement[]; gains: GainNode[] };
    observed.media = []; observed.gains = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!observed.media.includes(this)) observed.media.push(this);
      return play.call(this);
    };
    if (typeof AudioContext !== "undefined") {
      const gain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function () { const node = gain.call(this); observed.gains.push(node); return node; };
    }
  });
  await page.goto("/#/player/ushkova");
  const background = page.getByRole("button", { name: "Музыкальный фон", exact: true });
  await expect(background).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => performance.getEntriesByType("resource").some(r => r.name.includes("/background-")))).toBe(false);
  await background.click();
  if (!await page.evaluate(() => typeof AudioContext !== "undefined")) {
    // Playwright's Windows WebKit has no Web Audio implementation. Verify the
    // honest unavailable state and unaffected narration, not a fake mix.
    await expect(background).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("status")).toContainText("Музыкальный фон недоступен");
    await page.getByRole("button", { name: "Воспроизвести историю" }).click();
    await expect.poll(async () => Number(await page.getByRole("slider").inputValue()), { timeout: 15000 }).toBeGreaterThan(1);
    test.info().annotations.push({ type: "limitation", description: "This WebKit build has no AudioContext; actual iPhone mixing requires device testing." });
    return;
  }
  await expect(background).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Воспроизвести историю" }).click();
  const status = () => page.evaluate(() => {
    const observed = window as typeof window & { media: HTMLMediaElement[]; gains: GainNode[] };
    return { tracks: observed.media.map(a => ({ music: a.src.includes("/background-"), time: a.currentTime, paused: a.paused, speed: a.playbackRate, ready: a.readyState, seeking: a.seeking, error: a.error?.code })), gains: observed.gains.map(g => g.gain.value), caption: document.querySelector('.player-caption')?.textContent, enabled: document.querySelector('.background-toggle')?.getAttribute('aria-pressed') };
  });
  try { await expect.poll(async () => (await status()).tracks.filter(t => !t.paused && t.time > 1).length, { timeout: 25000 }).toBe(2); }
  catch (error) { throw new Error(`${String(error)}\nMedia state: ${JSON.stringify(await status())}\n${await page.locator('.notice-region').innerText()}`); }
  expect((await status()).gains[0]).toBeCloseTo(.08);
  await page.getByRole("button", { name: "Скорость воспроизведения 1", exact: true }).click();
  expect((await status()).tracks.find(t => t.music)!.speed).toBe(1);
  expect((await status()).tracks.find(t => !t.music)!.speed).toBe(1.25);
  await page.getByRole("button", { name: "Следующее фото", exact: true }).click();
  expect((await status()).tracks.every(t => !t.paused)).toBe(true);
  await background.click();
  await expect.poll(async () => (await status()).tracks.find(t => t.music)!.paused).toBe(true);
  expect((await status()).tracks.find(t => !t.music)!.paused).toBe(false);
  await background.click();
  await expect.poll(async () => (await status()).tracks.find(t => t.music)!.paused).toBe(false);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect.poll(async () => (await status()).tracks.every(t => t.paused)).toBe(true);
  await page.getByRole("button", { name: "Действия с историей" }).click();
  await expect(page.getByRole("dialog")).toContainText("Kevin MacLeod");
  await expect(page.getByRole("link", { name: "CC BY 4.0", exact: true })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
});

test("a failed music download does not stop the narration", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-402", "Browser network failure check.");
  await page.route("**/media/background-*.mp3", route => route.abort());
  await page.goto("/#/player/ushkova");
  await page.getByRole("button", { name: "Воспроизвести историю" }).click();
  const slider = page.getByRole("slider", { name: "Позиция аудиоистории" });
  await expect.poll(async () => Number(await slider.inputValue()), { timeout: 15000 }).toBeGreaterThan(1);
  const before = Number(await slider.inputValue());
  await page.getByRole("button", { name: "Музыкальный фон", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Музыкальный фон недоступен");
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(before);
  await expect(page.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
});
