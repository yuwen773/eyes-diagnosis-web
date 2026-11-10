import { defineConfig, devices } from "@playwright/test"

/**
 * 验收冒烟。后端不在这里起：登录、判读、Agent 都需要 :8081 + MySQL + Redis
 * + 算法服务，起法与账密见 e2e/README.md。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
