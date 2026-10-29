import type { HomeContent, HomeRepository } from "../domain/home";

// Local demonstration data, transcribed from Figma 6:835. No API or Supabase.
const content: HomeContent = {
  heading: "Город ждёт.",
  hero: {
    eyebrow: "СВОЙ В ГОРОДЕ",
    title: "Пойдём\nгулять?",
    description: "Я покажу тебе\nдругую Казань.",
    action: "Начать прогулку",
  },
  route: {
    id: "around-kremlin-demo",
    heading: "Твой первый маршрут",
    eyebrow: "НАЧНИ ОТСЮДА",
    title: "Вокруг\nКремля",
    durationMinutes: 45,
    distanceKm: 1.8,
  },
};

export const localHomeRepository: HomeRepository = {
  async getHome(signal) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return { ...content, hero: { ...content.hero }, route: { ...content.route } };
  },
};
