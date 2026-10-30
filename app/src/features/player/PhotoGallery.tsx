import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import type { Place, PlaceImage } from "../../domain/demo";
import { mediaUrl } from "../../data/api";
import { OriginalAsset } from "../../components/OriginalAsset";
import { PhotoCredit } from "../../components/PlacePhoto";
import { DetailSheet } from "../../components/DetailSheet";

const albums = new Map<string, PlaceImage[]>();
export function PhotoGallery({ place, children }: { place: Place; children: ReactNode }) {
  const [items, setItems] = useState<PlaceImage[]>(place.image ? [place.image] : []);
  const [index, setIndex] = useState(0), [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0), [imageFailed, setImageFailed] = useState(false);
  const down = useRef<{ x: number; y: number } | undefined>(undefined), swiped = useRef(false);
  const current = items[index - 1], total = items.length + 1;
  useEffect(() => {
    if (!place.galleryUrl) return;
    const url = mediaUrl(place.galleryUrl), controller = new AbortController();
    setFailed(false);
    if (albums.has(url)) { setItems(albums.get(url)!); return; }
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("gallery");
      const data = await response.json() as { items: PlaceImage[] };
      if (!Array.isArray(data.items) || data.items.some(image => !image.url?.startsWith("/media/") || !image.sourceUrl?.startsWith("https://"))) throw new Error("gallery");
      if (!controller.signal.aborted) { albums.set(url, data.items); setItems(data.items); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [place.galleryUrl, attempt]);
  useEffect(() => {
    const next = items[index];
    if (next) { const image = new Image(); image.src = mediaUrl(next.url); }
  }, [items, index]);
  function move(step: number) { setImageFailed(false); setIndex(value => Math.max(0, Math.min(items.length, value + step))); }
  function start(event: PointerEvent) {
    swiped.current = false; down.current = undefined;
    if ((event.target as HTMLElement).closest("[data-gallery-control]")) return;
    down.current = { x: event.clientX, y: event.clientY };
  }
  function finish(event: PointerEvent) {
    if (!down.current) return;
    const dx = event.clientX - down.current.x, dy = event.clientY - down.current.y;
    down.current = undefined;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) { swiped.current = true; move(dx < 0 ? 1 : -1); }
  }
  const navigation = <>
    {index > 0 && <button className="round-action gallery-previous" data-gallery-control type="button" aria-label="Предыдущее фото" onClick={() => move(-1)}><OriginalAsset asset="player.imgArrowLeft1" /></button>}
    {index < items.length && <button className="round-action gallery-next" data-gallery-control type="button" aria-label="Следующее фото" onClick={() => move(1)}><OriginalAsset asset="player.imgArrowRight" /></button>}
  </>;
  return <>
    <section className="audio-cover photo-gallery" role="region" aria-label="Фотографии экскурсии" aria-roledescription="галерея" data-photo-count={items.length} tabIndex={0}
      onPointerDown={start} onPointerUp={finish} onPointerCancel={() => { down.current = undefined; }}
      onClickCapture={event => { if (swiped.current) { event.preventDefault(); event.stopPropagation(); swiped.current = false; } }}
      onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
      {current ? <button type="button" className="gallery-photo-open" onClick={() => setExpanded(true)} aria-label={`Открыть фото: ${current.caption}`}>
        <img key={current.url} src={mediaUrl(current.url)} width={current.width} height={current.height} alt={current.caption} draggable={false} onError={() => setImageFailed(true)} />
        <span className="gallery-photo-caption">{current.caption}{current.date ? ` · ${current.date}` : ""}</span>
      </button> : children}
      <span className="cover-chapter" aria-live="polite" aria-label={`Кадр ${index + 1} из ${total}`}>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      {current && <PhotoCredit image={current} className="gallery-credit" />}
      {navigation}
      {failed && <button className="gallery-retry" type="button" data-gallery-control onClick={() => setAttempt(n => n + 1)}>Повторить загрузку фото</button>}
      {imageFailed && <span className="gallery-image-error" role="status">Фото не загрузилось. Другие кадры и аудио доступны.</span>}
    </section>
    {expanded && current && <DetailSheet title={current.caption} onClose={() => setExpanded(false)}>
      <img className="expanded-gallery-photo" src={mediaUrl(current.url)} width={current.width} height={current.height} alt={current.caption} draggable={false} />
      <div className="expanded-gallery-navigation"><button className="round-action" type="button" aria-label="Предыдущее фото крупно" disabled={index <= 1} onClick={() => move(-1)}><OriginalAsset asset="player.imgArrowLeft1" /></button><span>{index} / {items.length}</span><button className="round-action" type="button" aria-label="Следующее фото крупно" disabled={index >= items.length} onClick={() => move(1)}><OriginalAsset asset="player.imgArrowRight" /></button></div>
      {current.date && <p>{current.date}</p>}<PhotoCredit image={current} />
      <p className="gallery-license-note">Материал показан с сохранением пропорций. В карточке применяется кадрирование; лицензия исходного изображения сохраняется.</p>
    </DetailSheet>}
  </>;
}
