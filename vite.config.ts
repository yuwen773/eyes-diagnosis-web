import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // e2e 是 Playwright 的用例，别被 Vitest 收进来。
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Spring Boot dev server: context-path /api
      "/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
        // 后端 CORS 是精确白名单（默认只有 5173）。dev server 换端口（5199 等）
        // 时 Origin 会跟着变，把 Origin 改写成 target，代理后就是同源请求。
        // 只影响 dev 代理，不影响生产构建。
        headers: { Origin: "http://localhost:8081" },
      },
    },
  },
})
