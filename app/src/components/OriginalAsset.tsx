import { figmaAssets, type AssetKey } from "../data/figmaAssets";

export function OriginalAsset({ asset, className, alt = "" }: { asset: AssetKey; className?: string; alt?: string }) {
  const original = figmaAssets[asset];
  return <img src={original.src} width={original.width} height={original.height} className={className} alt={alt} aria-hidden={alt ? undefined : true} draggable={false} data-asset={asset} />;
}

export function ZilantAvatar({ small = false }: { small?: boolean }) {
  return <span className={`chat-face ${small ? "chat-face-small" : ""}`} aria-hidden="true">
    <span className="chat-face-head"><OriginalAsset asset={small ? "dialog.img13" : "dialog.img11"} /></span>
    <span className="chat-face-crown"><OriginalAsset asset={small ? "dialog.img14" : "dialog.img12"} /></span>
  </span>;
}
