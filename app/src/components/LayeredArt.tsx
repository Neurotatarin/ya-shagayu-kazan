import { figmaArt } from "../data/figmaArt";
import { OriginalAsset } from "./OriginalAsset";
import type { AssetKey } from "../data/figmaAssets";

interface ArtLayer { asset?: string; x?: number; y?: number; width?: number; height?: number; clip?: boolean; children?: readonly ArtLayer[] }

function Layer({ node }: { node: ArtLayer }) {
  if (node.asset) return <OriginalAsset asset={node.asset as AssetKey} />;
  return <span style={{ position: "absolute", left: node.x, top: node.y, width: node.width, height: node.height, overflow: node.clip ? "hidden" : undefined }}>
    {node.children?.map((child, index) => <Layer node={child} key={index} />)}
  </span>;
}

// Illustration groups retain the original SVG roots, stacking order and clipping.
export function LayeredArt({ name }: { name: keyof typeof figmaArt }) {
  return <span className="layered-art" aria-hidden="true"><Layer node={figmaArt[name]} /></span>;
}
