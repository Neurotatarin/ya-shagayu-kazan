type ImageAsset = { src: string; available: boolean };
export function OriginalImage({
  asset,
  alt,
  className,
}: {
  asset: ImageAsset;
  alt: string;
  className?: string;
}) {
  return asset.available ? (
    <img className={className} src={asset.src} alt={alt} draggable={false} />
  ) : (
    <span
      className={`${className ?? ""} asset-pending`}
      role="img"
      aria-label={`${alt}. Оригинал пока недоступен`}
    />
  );
}
