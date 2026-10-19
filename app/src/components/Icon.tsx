import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { MapTrifoldIcon } from "@phosphor-icons/react/dist/csr/MapTrifold";
import { PathIcon } from "@phosphor-icons/react/dist/csr/Path";
import { PersonSimpleWalkIcon } from "@phosphor-icons/react/dist/csr/PersonSimpleWalk";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
export type IconName =
  | "arrow-right"
  | "arrow-up-right"
  | "house"
  | "map-trifold"
  | "path"
  | "person-simple-walk"
  | "user-circle";
// Phosphor source names match the icon names observed in the selected Figma variant.
const icons = {
  "arrow-right": ArrowRightIcon,
  "arrow-up-right": ArrowUpRightIcon,
  house: HouseIcon,
  "map-trifold": MapTrifoldIcon,
  path: PathIcon,
  "person-simple-walk": PersonSimpleWalkIcon,
  "user-circle": UserCircleIcon,
};
export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const Glyph = icons[name];
  return <Glyph size={size} weight="fill" aria-hidden="true" />;
}
