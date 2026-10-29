import type { Destination, HomeContent } from "../../domain/home";
import { FigmaIcon } from "../../components/FigmaIcon";

export function HomePage({ content, onNavigate }: { content: HomeContent; onNavigate: (destination: Destination) => void }) {
  const { hero, route } = content;
  return (
    <>
      <header className="home-header">
        <div className="brand" aria-label="Я шагаю по Казани"><span>Я шагаю</span><small>по Казани</small></div>
        <button type="button" className="profile-shortcut" aria-label="Открыть профиль" onClick={() => onNavigate("profile")}><FigmaIcon name="profile-green" /></button>
      </header>
      <main className="home-page" aria-labelledby="home-title">
        <h1 id="home-title" className="home-title">{content.heading}</h1>
        <section className="welcome-scene" aria-labelledby="welcome-title" data-figma-node="6:860">
          <div className="zilant-scene-window"><img className="zilant-hello" src="/assets/home/zilant-hello.png" alt="Зилант приглашает на прогулку" draggable={false} /></div>
          <p className="scene-eyebrow">{hero.eyebrow}</p>
          <h2 id="welcome-title">{hero.title}</h2>
          <p className="scene-description">{hero.description}</p>
          <button className="start-walk" type="button" onClick={() => onNavigate("map")}><FigmaIcon name="arrow-white" /><span>{hero.action}</span></button>
        </section>
        <section className="featured-route" aria-labelledby="featured-route-title">
          <div className="featured-heading"><h2 id="featured-route-title">{route.heading}</h2><button type="button" aria-label="Все маршруты" onClick={() => onNavigate("routes")}><FigmaIcon name="arrow-right" /></button></div>
          <button className="route-card" type="button" aria-label={`${route.title.replace("\n", " ")}, ${route.durationMinutes} минут, ${route.distanceKm.toLocaleString("ru-RU")} километра`} onClick={() => onNavigate("routes")} data-figma-node="6:890">
            <img className="kremlin-photo" src="/assets/home/kremlin.jpg" alt="Казанский Кремль" draggable={false} />
            <span className="route-copy">
              <span className="route-eyebrow">{route.eyebrow}</span>
              <span className="route-title">{route.title}</span>
              <span className="route-meta"><FigmaIcon name="walk" /><span>{route.durationMinutes} мин · {route.distanceKm.toLocaleString("ru-RU")} км</span></span>
            </span>
            <span className="open-route"><FigmaIcon name="arrow-green" /></span>
          </button>
        </section>
      </main>
    </>
  );
}
