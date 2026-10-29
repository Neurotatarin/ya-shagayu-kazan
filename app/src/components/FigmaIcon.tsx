// Original SVG exports from the paid Figma MCP, used at their native root sizes.
const icons = {
  home: ["house.svg", 28, 28],
  map: ["map.svg", 28, 28],
  routes: ["routes.svg", 28, 28],
  profile: ["profile-muted.svg", 28, 28],
  "profile-green": ["profile-green.svg", 30, 30],
  "arrow-white": ["arrow-up-right-white.svg", 23, 23],
  "arrow-green": ["arrow-up-right-green.svg", 25, 25],
  "arrow-right": ["arrow-right-green.svg", 29, 29],
  walk: ["walk-white.svg", 22, 22],
} as const;

export type FigmaIconName = keyof typeof icons;

export function FigmaIcon({ name }: { name: FigmaIconName }) {
  const [file, width, height] = icons[name];
  return <img className="figma-icon" src={`/assets/home/${file}`} width={width} height={height} alt="" aria-hidden="true" draggable={false} />;
}

export function ZilantFace() {
  return (
    <span className="zilant-face" aria-hidden="true">
      <span className="zilant-face-source">
        <img className="zilant-face-head" src="/assets/home/zilant-head.svg" width={46.199} height={38.1435} alt="" draggable={false} />
        <img className="zilant-face-crown" src="/assets/home/zilant-crown.svg" width={14.4125} height={13.3556} alt="" draggable={false} />
      </span>
    </span>
  );
}
