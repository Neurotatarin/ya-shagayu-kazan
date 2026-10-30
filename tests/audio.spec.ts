import { expect, test } from "@playwright/test";

test("original MP3s play, seek, pause, keep position and survive screen changes", async ({ page }, info) => {
  test.setTimeout(60000);
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name), "Audio engines are checked in Chromium and iPhone WebKit.");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/#/player/ushkova");
  const slider = page.getByRole("slider", { name: "Позиция аудиоистории" });
  await expect(page.locator(".player-times")).toContainText("4:15");
  await page.getByRole("button", { name: "Воспроизвести историю" }).click();
  await expect(page.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
  await expect.poll(async () => Number(await slider.inputValue()), { timeout: 15000 }).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await slider.fill("65");
  await expect(slider).toHaveValue("65");
  await page.getByRole("button", { name: "Скорость воспроизведения 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Скорость воспроизведения 1.25", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Воспроизвести историю" }).click();
  await expect.poll(async () => Number(await slider.inputValue()), { timeout: 15000 }).toBeGreaterThan(66);
  await page.getByRole("button", { name: "Назад к месту" }).click();
  await expect(page.getByRole("heading", { name: "Дом Ушковой" })).toBeVisible();
  await page.getByRole("button", { name: /Слушать историю/ }).click();
  await expect(page.getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await slider.fill("91");
  await page.waitForResponse(response => response.url().endsWith("/api/progress") && response.request().method() === "PUT" && response.ok());
  await page.reload();
  await expect(slider).toHaveValue("91");
  await page.getByRole("button", { name: "Воспроизвести историю" }).click();
  await expect.poll(async () => Number(await slider.inputValue()), { timeout: 15000 }).toBeGreaterThan(92);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await page.goto("/#/player/kremlin");
  await expect(page.locator(".player-times")).toContainText("4:06");
  await page.getByRole("button", { name: "Воспроизвести историю" }).click();
  await expect.poll(async () => Number(await slider.inputValue()), { timeout: 15000 }).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  // Windows WebKit's native media pipeline does not expose MP3 responses through
  // page.on('response'). Check byte ranges independently of that browser detail.
  const chunk = await page.request.get("/media/kremlin-06681b66c5a9.mp3", { headers: { Range: "bytes=0-1023" } });
  expect(chunk.status()).toBe(206);
  expect((await chunk.body()).length).toBe(1024);
  expect(errors).toEqual([]);
});
