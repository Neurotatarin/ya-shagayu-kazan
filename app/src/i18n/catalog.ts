import type { DemoCatalog, Place, PlaceImage, ThemeRoute } from "../domain/demo";
import type { HomeContent } from "../domain/home";
import { countPlaces, getLanguage, t, translate, type Language } from ".";

export function selectAudioTrack(place: Place, language: Language) {
  const track = place.audioTracks?.[language] ?? (language === "ru" && place.audioUrl ? { url: place.audioUrl, durationSeconds: place.durationSeconds } : undefined);
  return track?.url.startsWith("/media/") && Number.isFinite(track.durationSeconds) && track.durationSeconds > 0 ? track : undefined;
}
export function localizePlace(place: Place, language: Language): Place {
  const text = place.translations?.[language];
  const track = selectAudioTrack(place, language);
  return { ...place, title: text?.title ?? translate(place.title, language), eyebrow: text?.eyebrow ?? translate(place.eyebrow, language), address: text?.address ?? (place.address ? translate(place.address, language) : undefined), description: text?.description ?? translate(place.description, language), audioUrl: track?.url, durationSeconds: track?.durationSeconds ?? 0, audioLanguage: language };
}
function localizeRoute(route: ThemeRoute, language: Language): ThemeRoute {
  let meta = route.meta.replace(/(\d+) мест(?:а|о)?/, (_, count: string) => countPlaces(Number(count))).replace(/рассчитать путь/g, t("рассчитать путь")).replace(/км/g, t("км")).replace(/мин пешком/g, t("мин пешком"));
  if (language !== "ru") meta = meta.replace(/(\d),(\d)/g, "$1.$2");
  return { ...route, title: translate(route.title, language), description: translate(route.description, language), meta };
}
export function localizeCatalog(catalog: DemoCatalog, language: Language): DemoCatalog {
  return { places: catalog.places.map(place => localizePlace(place, language)), routes: catalog.routes.map(route => localizeRoute(route, language)) };
}
export function localizeHome(content: HomeContent, language: Language): HomeContent {
  const text = (value: string) => translate(value, language);
  return { ...content, heading: text(content.heading), hero: { ...content.hero, title: text(content.hero.title), eyebrow: text(content.hero.eyebrow), description: text(content.hero.description), action: text(content.hero.action) }, route: { ...content.route, heading: text(content.route.heading), eyebrow: text(content.route.eyebrow), title: text(content.route.title) } };
}
export function photoCaption(image: PlaceImage, place: Place) {
  if (getLanguage() === "ru") return image.caption;
  return image.captions?.[getLanguage()] ?? (t(image.caption) !== image.caption ? t(image.caption) : /архив|историч|до 19|до 18/i.test(image.caption) ? `${place.title} · ${t("Исторический вид")}` : place.title);
}
export const photoDate = (date: string) => date.replace(/^до (\d+)/, (_, year: string) => t("до {0}", { 0: year }));
