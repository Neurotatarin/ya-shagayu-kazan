// Only mark an asset available after the original Figma export is in public/assets/home.
// Missing assets are never replaced by unrelated photographs or characters.
export const homeAssets = {
  zilant: { src: "/assets/home/zilant-hello.png", available: false },
  kremlin: { src: "/assets/home/kremlin.jpg", available: false },
  zilantFace: { src: "/assets/home/zilant-face.svg", available: false },
} as const;
