import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "ru.yashagayu.kazan.demo",
  appName: "Я шагаю по Казани",
  webDir: "dist",
  ios: {
    contentInset: "never",
    backgroundColor: "#ffffff",
    preferredContentMode: "mobile",
  },
  server: { iosScheme: "capacitor" },
};
export default config;
