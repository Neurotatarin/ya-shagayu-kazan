import type { HomeContent, HomeRepository } from "../domain/home";
// Local presentation data from Figma 6:835. No API or Supabase connection.
const home: HomeContent = {
  cityName: "Казани",
  heading: "Город ждёт.",
  hero: {
    eyebrow: "СВОЙ В ГОРОДЕ",
    title: "Пойдём\nгулять?",
    description: "Я покажу тебе\nдругую Казань.",
    action: "Начать прогулку",
  },
  featuredRoute: {
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
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
    return {
      ...home,
      hero: { ...home.hero },
      featuredRoute: { ...home.featuredRoute },
    };
  },
};
