import type { Destination } from "../domain/home";
import { FigmaIcon, ZilantFace } from "./FigmaIcon";

const destinations = [
  { id: "home", label: "Главная" },
  { id: "map", label: "Карта" },
  { id: "zilant", label: "Зилант" },
  { id: "routes", label: "Маршруты" },
  { id: "profile", label: "Профиль" },
] as const;

export function BottomNavigation({ onNavigate }: { onNavigate: (destination: Destination) => void }) {
  return (
    <nav className="bottom-navigation" aria-label="Основная навигация" data-figma-node="9:1752">
      {destinations.map(({ id, label }) => (
        <button key={id} type="button" className={`nav-destination nav-${id}`} aria-label={label} aria-current={id === "home" ? "page" : undefined} onClick={() => onNavigate(id)}>
          {id === "home" && <span className="nav-active" />}
          {id === "zilant" ? <><span className="zilant-disc" /><ZilantFace /></> : <><FigmaIcon name={id} /><span className="nav-label">{label}</span></>}
        </button>
      ))}
    </nav>
  );
}
