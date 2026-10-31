import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ru.yashagayu.kazan.demo",
  appName: "Я шагаю по Казани",
  webDir: "dist",
  android: { backgroundColor: "#ffffff", allowMixedContent: false, webContentsDebuggingEnabled: false },
  plugins: { SystemBars: { style: "LIGHT", insetsHandling: "native", initialViewportFitValueHint: "cover", animation: "NONE" } },
  ios: {
    contentInset: "never",
    backgroundColor: "#ffffff",
    preferredContentMode: "mobile",
  },
  server: { iosScheme: "capacitor" },
};
export default config;
