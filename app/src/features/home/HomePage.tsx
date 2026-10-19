import type { Destination, HomeContent } from "../../domain/home";
import { homeAssets } from "../../data/assets";
import { Icon } from "../../components/Icon";
import { OriginalImage } from "../../components/OriginalImage";
export function HomePage({
  content,
  onNavigate,
}: {
  content: HomeContent;
  onNavigate: (destination: Destination) => void;
}) {
  const { hero, featuredRoute } = content;
  return (
    <>
      <header className="brand-header">
        <div className="brand" aria-label={`Я шагаю по ${content.cityName}`}>
          <span>Я шагаю</span>
          <small>по {content.cityName}</small>
        </div>
        <button
          type="button"
          className="profile-button"
          aria-label="Открыть профиль"
          onClick={() => onNavigate("profile")}
        >
          <Icon name="user-circle" size={27} />
        </button>
      </header>
      <main className="home-content">
        <h1>{content.heading}</h1>
        <section className="welcome-card" aria-labelledby="welcome-title">
          <OriginalImage
            asset={homeAssets.zilant}
            alt="Зилант приглашает на прогулку"
            className="hero-zilant"
          />
          <div className="welcome-copy">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h2 id="welcome-title">{hero.title}</h2>
            <p className="welcome-description">{hero.description}</p>
          </div>
          <button
            type="button"
            className="start-button"
            onClick={() => onNavigate("map")}
          >
            <Icon name="arrow-up-right" size={25} />
            <span>{hero.action}</span>
          </button>
        </section>
        <section className="featured-section" aria-labelledby="featured-title">
          <div className="section-heading">
            <h2 id="featured-title">{featuredRoute.heading}</h2>
            <button
              className="all-routes-button"
              type="button"
              aria-label="Все маршруты"
              onClick={() => onNavigate("routes")}
            >
              <Icon name="arrow-right" size={26} />
            </button>
          </div>
          <button
            type="button"
            className="route-card"
            onClick={() => onNavigate("routes")}
          >
            <div className="route-copy">
              <p className="eyebrow">{featuredRoute.eyebrow}</p>
              <h3>{featuredRoute.title}</h3>
              <p className="route-meta">
                <Icon name="person-simple-walk" size={17} />
                <span>
                  {featuredRoute.durationMinutes} мин ·{" "}
                  {featuredRoute.distanceKm.toLocaleString("ru-RU")} км
                </span>
              </p>
            </div>
            <OriginalImage
              asset={homeAssets.kremlin}
              alt="Казанский Кремль"
              className="route-photo"
            />
            <span className="route-open">
              <Icon name="arrow-up-right" size={26} />
            </span>
          </button>
        </section>
      </main>
    </>
  );
}
