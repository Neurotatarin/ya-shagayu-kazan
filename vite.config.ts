import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "app",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, target: "safari15" },
  server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy: { "/api": "http://127.0.0.1:8792", "/media": { target: "https://kazan-demo.38-180-191-162.sslip.io", changeOrigin: true } } },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy: { "/api": "http://127.0.0.1:8792", "/media": { target: "https://kazan-demo.38-180-191-162.sslip.io", changeOrigin: true } } },
});
