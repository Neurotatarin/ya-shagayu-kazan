import { t } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { LayeredArt } from "../../components/LayeredArt";
import { OriginalAsset } from "../../components/OriginalAsset";
import type { ThemeRoute } from "../../domain/demo";
import type { AssetKey } from "../../data/figmaAssets";

const themeArrows: Record<ThemeRoute["theme"], AssetKey> = {
  heart: "route-heart.imgArrowUpRight", imperial: "route-imperial.imgArrowUpRight", tatar: "route-tatar.imgArrowUpRight", threeHours: "route-three-hours.imgArrowUpRight", modern: "route-modern.imgArrowUpRight",
};

function ThemeCard({ route, number, onOpen }: { route: ThemeRoute; number: number; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setScale(entry!.contentRect.width / 314)); observer.observe(ref.current!); return () => observer.disconnect(); }, []);
  return <button ref={ref} type="button" className={`theme-card theme-${route.theme}`} aria-label={`${route.title.replace("\n", " ")}, ${route.meta}`} onClick={onOpen} data-figma-node={route.nodeId}>
    <span className="theme-card-design" style={{ transform: `scale(${scale})` }}>
      <span className="theme-title">{route.title}</span><span className="theme-description">{route.description}</span>
      <LayeredArt name={route.theme} />
      <span className="theme-meta">{route.meta}</span>
      <span className="theme-open"><OriginalAsset asset={themeArrows[route.theme]} /></span>
      <span className="theme-number">{String(number).padStart(2, "0")}</span>
    </span>
  </button>;
}

export function RoutesPage({ routes, onSelect, onZilant }: { routes: readonly ThemeRoute[]; onSelect: (route: ThemeRoute) => void; onZilant: () => void }) {
  const gallery = useRef<HTMLDivElement>(null);
  return <main className="routes-page standard-page" data-figma-node="11:8928">
    <h1>{t("Маршруты")}</h1><p className="page-subtitle">{t("Выбирай, как знакомиться с Казанью.")}</p>
    <h2 className="themes-heading">{t("Темы прогулок")}</h2>
    <div className="themes-gallery" ref={gallery} aria-label={t("Пять тем прогулок")} tabIndex={0} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); gallery.current?.scrollBy({ left: (event.key === "ArrowRight" ? 1 : -1) * 330, behavior: "auto" }); } }}>
      {routes.map((route, index) => <ThemeCard key={route.id} route={route} number={index + 1} onOpen={() => onSelect(route)} />)}
    </div>
    <div className="themes-footer"><span>{t("5 маршрутов")}</span><button type="button" aria-label={t("Следующая тема прогулки")} onClick={() => { const el = gallery.current!; el.scrollTo({ left: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 ? 0 : el.scrollLeft + Math.min(330, el.clientWidth - 20), behavior: "auto" }); }}><span>{t("Листай и выбирай")}</span><span className="theme-footer-arrow"><OriginalAsset asset="routes-footer-arrow.imgArrowRight" /></span></button></div>
    <section className="route-zilant-cta"><h2>{t("Хочется чего-то другого?")}</h2><p>{t("Зилант поможет выбрать прогулку.")}</p><button className="primary-action" type="button" onClick={onZilant}><OriginalAsset asset="routes-cta.imgArrowUpRight" /><span>{t("Подобрать с Зилантом")}</span></button></section>
  </main>;
}
