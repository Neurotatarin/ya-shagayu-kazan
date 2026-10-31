import { defineConfig } from "vite";
import { resolve } from "node:path";

// Test-only document, copied into the simulator after the device IPA is sealed.
export default defineConfig({
  root: resolve("native/tests/web"),
  base: "./",
  build: { outDir: resolve("work/native-smoke-web"), emptyOutDir: true, target: "es2020" },
});
