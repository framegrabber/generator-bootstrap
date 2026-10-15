import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev -- --port 5174",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:5174",
    ...devices["Desktop Chrome"],
    // Headless Chromium's default software WebGL redraws a large preview (the dog's ~140k
    // triangles) so slowly that it starves the main thread; exports then take a minute.
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader"] },
  },
});
