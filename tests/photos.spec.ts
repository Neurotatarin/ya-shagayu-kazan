import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("all catalog places show their own photo, credits and the existing card geometry", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-402", "Cover inventory is independent of the browser engine.");
  test.setTimeout(90000);
  const catalog = await (await page.request.get("/api/catalog")).json();
  expect(catalog.places).toHaveLength(20);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await mkdir("test-results/screenshots", { recursive: true });
  for (const place of catalog.places) {
    expect(!!(place.photo || place.image), place.id).toBeTruthy();
    const response = await page.request.get(place.galleryUrl);
    expect(response.ok(), `Gallery for ${place.id}`).toBe(true);
    const album = await response.json();
    expect(new Set(album.items.map((photo: { url: string }) => photo.url)).size, place.id).toBeGreaterThanOrEqual(15);
    expect(album.items.every((photo: { sourceUrl: string; license: string; width: number; height: number }) => photo.sourceUrl.startsWith("https://commons.wikimedia.org/") && photo.license && photo.width > 0 && photo.height > 0), place.id).toBe(true);
    await page.goto(`/#/place/${place.id}`);
    await expect(page.getByRole("heading", { name: place.title, exact: true })).toBeVisible();
    const photo = page.locator(".place-hero > img");
    await expect(photo).toBeVisible();
    expect(await photo.evaluate(async (image: HTMLImageElement) => { await image.decode(); return image.naturalWidth > 0; })).toBe(true);
    if (place.image) {
      await expect(photo).toHaveAttribute("data-place-photo", place.id);
      await expect(page.locator(".place-photo-credit")).toContainText(place.image.license);
      expect((await photo.boundingBox())!.height).toBe(308);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), place.id).toBe(false);
    if (["petro", "bauman", "temple", "ekiyat"].includes(place.id)) await page.screenshot({ path: `test-results/screenshots/photo-${place.id}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("15+ gallery photos swipe and enlarge while real audio keeps playing", async ({ page }, info) => {
  test.skip(!["phone-402", "iphone-xr-webkit"].includes(info.project.name), "Touch gallery and media checked in both engines.");
  test.setTimeout(90000);
  for (const id of ["ushkova", "kremlin"]) {
    await page.goto(`/#/player/${id}`);
    const gallery = page.getByRole("region", { name: "Фотографии экскурсии" });
    await expect.poll(async () => Number(await gallery.getAttribute("data-photo-count"))).toBeGreaterThanOrEqual(15);
    const captionY = (await page.locator(".player-caption").boundingBox())!.y;
    const slider = page.getByRole("slider", { name: "Позиция аудиоистории" });
    await page.locator(".player-page").getByRole("button", { name: "Воспроизвести историю" }).click();
    await expect.poll(async () => Number(await slider.inputValue()), { timeout: 15000 }).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Следующее фото", exact: true }).click();
    await expect(page.locator(".cover-chapter")).toHaveAttribute("aria-label", /Кадр 2 из/);
    const bounds = (await gallery.boundingBox())!;
    await gallery.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: bounds.x + bounds.width - 70, clientY: bounds.y + bounds.height / 2 });
    await gallery.dispatchEvent("pointerup", { pointerId: 1, pointerType: "touch", clientX: bounds.x + 70, clientY: bounds.y + bounds.height / 2 });
    await expect(page.locator(".cover-chapter")).toHaveAttribute("aria-label", /Кадр 3 из/);
    await expect(page.locator(".player-page").getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
    expect((await page.locator(".player-caption").boundingBox())!.y).toBe(captionY);
    const before = Number(await slider.inputValue());
    await page.getByRole("button", { name: /^Открыть фото:/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".expanded-gallery-photo")).toHaveCSS("object-fit", "contain");
    await expect(dialog.locator(".photo-credit a").first()).toHaveAttribute("href", /^https:\/\/commons\.wikimedia\.org\//);
    await expect.poll(async () => Number(await slider.inputValue()), { timeout: 10000 }).toBeGreaterThan(before);
    await page.getByRole("button", { name: "Закрыть окно" }).click();
    await expect(page.locator(".player-page").getByRole("button", { name: "Пауза", exact: true })).toBeVisible();
    await page.locator(".player-page").getByRole("button", { name: "Пауза", exact: true }).click();
  }
});

test("gallery load failure keeps audio and cover available, and retry recovers", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-402", "One network recovery check is sufficient.");
  let fail = true;
  await page.route("**/media/gallery-ushkova-*.json", route => fail ? route.abort() : route.continue());
  await page.goto("/#/player/ushkova");
  const retry = page.getByRole("button", { name: "Повторить загрузку фото" });
  await expect(retry).toBeVisible();
  await expect(page.locator(".player-page").getByRole("button", { name: "Воспроизвести историю" })).toBeVisible();
  await expect(page.locator(".cover-zilant-window img")).toBeVisible();
  fail = false;
  await retry.click();
  await expect.poll(async () => Number(await page.locator(".photo-gallery").getAttribute("data-photo-count"))).toBeGreaterThanOrEqual(15);
  await expect(retry).not.toBeVisible();
});
