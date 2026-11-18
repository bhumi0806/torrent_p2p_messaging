import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e/tests",
    fullyParallel: false,
    workers: 1,
    timeout: 90_000,
    expect: { timeout: 25_000 },
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:5173",
        browserName: "chromium",
        headless: true,
        trace: "retain-on-failure",
        launchOptions: { args: ["--no-sandbox", "--disable-features=WebRtcHideLocalIpsWithMdns"] }
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    globalSetup: "./e2e/globalSetup.ts",
    globalTeardown: "./e2e/globalTeardown.ts"
});
