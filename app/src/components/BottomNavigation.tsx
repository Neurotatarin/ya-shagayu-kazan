import type { Destination } from "../domain/home";
import { FigmaIcon, ZilantFace } from "./FigmaIcon";
import { OriginalAsset } from "./OriginalAsset";

const destinations = [
  { id: "home", label: "Главная" },
  { id: "map", label: "Карта" },
  { id: "zilant", label: "Зилант" },
  { id: "routes", label: "Маршруты" },
  { id: "profile", label: "Профиль" },
] as const;

export function BottomNavigation({ current = "home", onNavigate }: { current?: Destination; onNavigate: (destination: Destination) => void }) {
  return (
    <nav className="bottom-navigation" aria-label="Основная навигация" data-figma-node="9:1752">
      {destinations.map(({ id, label }) => (
        <button key={id} type="button" className={`nav-destination nav-${id} ${current === id ? "nav-current" : ""}`} aria-label={label} aria-current={id === current ? "page" : undefined} onClick={() => onNavigate(id)}>
          {id === current && id !== "zilant" && <span className="nav-active" />}
          {id === "zilant" ? <><span className="zilant-disc" /><ZilantFace />{current === "zilant" && <><span className="nav-label">Зилант</span><span className="chat-nav-indicator" /></>}</> : <>
            {id === "home" ? (current === "home" ? <FigmaIcon name="home" /> : <OriginalAsset asset="map.imgHouse" className="figma-icon" />)
              : id === "map" ? <OriginalAsset asset={current === "map" ? "map.imgMapTrifold" : "dialog.imgMapTrifold"} className="figma-icon" />
              : id === "profile" ? <OriginalAsset asset={current === "profile" ? "profile.imgUserCircle" : "map.imgUserCircle"} className="figma-icon" />
              : current === "routes" ? <OriginalAsset asset="routes-navigation.imgFrame" className="figma-icon" /> : <FigmaIcon name="routes" />}
            <span className="nav-label">{label}</span>
          </>}
        </button>
      ))}
    </nav>
  );
}
