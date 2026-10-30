import { defineConfig, devices } from "@playwright/test";

const deployed = process.env.DEMO_BASE_URL;
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: { baseURL: deployed ?? "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "phone-small", use: { browserName: "chromium", viewport: { width: 320, height: 568 } } },
    { name: "phone-390", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "phone-402", use: { browserName: "chromium", viewport: { width: 402, height: 874 } } },
    { name: "iphone-xr-webkit", use: { ...devices["iPhone XR"], browserName: "webkit" } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: deployed ? undefined : [
    { command: "python server/server.py", url: "http://127.0.0.1:8792/api/health", env: { KAZAN_STATE: "work/e2e-server-state" }, reuseExistingServer: !process.env.CI },
    { command: "pnpm preview", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
  ],
});
