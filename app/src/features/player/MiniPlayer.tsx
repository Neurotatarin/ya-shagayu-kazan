import type { Place } from "../../domain/demo";
import { t } from "../../i18n";
import { OriginalAsset } from "../../components/OriginalAsset";
import { PlacePhoto } from "../../components/PlacePhoto";
import { toggleAudio, useAudioPlayback } from "../../platform/audioPlayback";

export function MiniPlayer({ place, onOpen, onClose, notice, compact = false }: { place: Place; onOpen: () => void; onClose: () => void; notice: (message: string) => void; compact?: boolean }) {
  const playback = useAudioPlayback();
  const status = playback.error ? t("Повторить загрузку") : playback.loading ? t("Загружаем запись…") : playback.playing ? t("Сейчас звучит") : t("На паузе");
  const progress = playback.duration ? Math.max(0, Math.min(100, 100 * playback.position / playback.duration)) : 0;
  return <aside className="mini-player" aria-label={t("Мини-плеер экскурсии")} data-figma-node={compact ? "2022:6980" : "2017:6979"}>
    <div className="mini-player-row">
      <button type="button" className="mini-player-open" aria-label={t("Вернуться к экскурсии: {0}", { 0: place.title })} onClick={onOpen}>
        <PlacePhoto place={place} className="mini-player-photo" alt="" />
        <span className="mini-player-copy"><span className="mini-player-title">{place.title}</span><span className="mini-player-status">{status}</span></span>
      </button>
      <button type="button" className="mini-player-toggle" aria-label={t(playback.playing ? "Пауза" : "Воспроизвести историю")} aria-busy={playback.loading} onClick={async () => {
        try { await toggleAudio(place, playback.position, playback.speed); }
        catch { notice(t("Не удалось начать воспроизведение. Попробуй ещё раз.")); }
      }}><OriginalAsset asset={playback.playing ? "player.imgPause" : "place.imgPlay"} /></button>
      <button type="button" className="mini-player-close" aria-label={t("Закрыть экскурсию")} onClick={onClose}>×</button>
    </div>
    <div className="mini-player-progress" role="progressbar" aria-label={t("Прогресс экскурсии")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)}><span style={{ width: `${progress}%` }} /></div>
  </aside>;
}
