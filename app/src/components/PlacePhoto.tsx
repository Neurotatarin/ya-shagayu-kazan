import { t } from "../i18n";
import type { Place, PlaceImage } from "../domain/demo";
import { mediaUrl } from "../data/api";
import { OriginalAsset } from "./OriginalAsset";

export const hasPlacePhoto = (place: Place) => !!(place.photo || place.image);

export function PlacePhoto({ place, className, alt = place.title }: { place: Place; className?: string; alt?: string }) {
  if (place.photo) return <OriginalAsset asset={place.photo} className={className} alt={alt} />;
  if (!place.image) return null;
  return <img className={className} src={mediaUrl(place.image.url)} width={place.image.width} height={place.image.height} alt={alt} draggable={false} data-place-photo={place.id} style={{ objectPosition: place.image.position ?? "50% 50%" }} />;
}

export function PhotoCredit({ image, className = "" }: { image: PlaceImage; className?: string }) {
  return <span className={`photo-credit ${className}`}><a href={image.sourceUrl} target="_blank" rel="noreferrer">{t("Фото:")} {image.author === "Автор не указан" ? t("Автор не указан") : image.author}</a><span> · </span><a href={image.licenseUrl || image.sourceUrl} target="_blank" rel="noreferrer">{image.license}</a></span>;
}
