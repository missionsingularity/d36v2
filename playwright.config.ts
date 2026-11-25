import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const distDir = process.env.PLAYWRIGHT_DIST_DIR ?? ".next";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/search`,
    env: { NEXT_DIST_DIR: distDir },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
