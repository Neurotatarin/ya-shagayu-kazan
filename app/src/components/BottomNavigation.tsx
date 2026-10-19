import type { Destination } from "../domain/home";
import { homeAssets } from "../data/assets";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { OriginalImage } from "./OriginalImage";
const items: { id: Destination; label: string; icon?: IconName }[] = [
  { id: "home", label: "Главная", icon: "house" },
  { id: "map", label: "Карта", icon: "map-trifold" },
  { id: "zilant", label: "Зилант" },
  { id: "routes", label: "Маршруты", icon: "path" },
  { id: "profile", label: "Профиль", icon: "user-circle" },
];
export function BottomNavigation({
  onNavigate,
}: {
  onNavigate: (destination: Destination) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav-item ${item.id === "home" ? "is-active" : ""} ${item.id === "zilant" ? "nav-zilant" : ""}`}
          aria-label={item.label}
          aria-current={item.id === "home" ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          {item.icon ? (
            <Icon name={item.icon} />
          ) : (
            <span className="zilant-avatar">
              <OriginalImage
                asset={homeAssets.zilantFace}
                alt="Зилант"
                className="zilant-avatar-image"
              />
            </span>
          )}
          <span className={item.id === "zilant" ? "sr-only" : "nav-label"}>
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
