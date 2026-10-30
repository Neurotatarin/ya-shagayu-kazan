import { t } from "../../i18n";
import { OriginalAsset } from "../../components/OriginalAsset";

export type ProfileSheet = "favorites" | "offline" | "settings" | "awards" | "account";

export function ProfilePage({ onOpen }: { onOpen: (section: ProfileSheet) => void }) {
  return <main className="profile-page standard-page" data-figma-node="9:4166">
    <h1>{t("Профиль")}</h1><p className="page-subtitle">{t("Твоя история знакомства с городом")}</p>
    <button className="traveler-card" type="button" onClick={() => onOpen("account")}><span className="traveler-avatar"><OriginalAsset asset="profile.imgUserCircle1" /></span><span><strong>{t("Твоя Казань")}</strong><small>{t("Любимые места и открытия")}</small></span></button>
    <section className="awards-card"><div className="awards-heading"><span className="medal-disc"><OriginalAsset asset="profile.imgFrame" /></span><h2>{t("Награды")}</h2></div><p>{t("За прогулки и новые открытия.")}</p><button className="primary-action dark-action" type="button" onClick={() => onOpen("awards")}><OriginalAsset asset="profile.imgArrowUpRight" /><span>{t("Открыть коллекцию")}</span></button></section>
    <div className="profile-sections">
      <button type="button" onClick={() => onOpen("favorites")}><OriginalAsset asset="profile.imgFrame1" /><span>{t("Избранное")}</span><OriginalAsset asset="profile.imgArrowRight" /></button>
      <button type="button" onClick={() => onOpen("offline")}><OriginalAsset asset="profile.imgCloudArrowDown" /><span>{t("Офлайн-маршруты")}</span><OriginalAsset asset="profile.imgArrowRight" /></button>
      <button type="button" onClick={() => onOpen("settings")}><OriginalAsset asset="profile.imgSlidersHorizontal" /><span>{t("Настройки")}</span><OriginalAsset asset="profile.imgArrowRight" /></button>
    </div>
  </main>;
}
