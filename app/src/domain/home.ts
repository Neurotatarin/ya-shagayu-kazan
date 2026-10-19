export type Destination = "home" | "map" | "zilant" | "routes" | "profile";
export type HomeContent = {
  cityName: string;
  heading: string;
  hero: { eyebrow: string; title: string; description: string; action: string };
  featuredRoute: {
    id: string;
    heading: string;
    eyebrow: string;
    title: string;
    durationMinutes: number;
    distanceKm: number;
  };
};
export interface HomeRepository {
  getHome(signal?: AbortSignal): Promise<HomeContent>;
}
