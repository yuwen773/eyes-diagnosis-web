# Iris · 产品前端

眼底影像判读系统的 Web 前端：React 19 + TypeScript + Vite + Tailwind v4。
设计系统见 `DESIGN.md`，令牌真源是 `src/styles/tokens.css`。

## 开发

```bash
npm install
npm run dev        # http://localhost:5173，代理 /api 到 :8081
```

## 验证

- `npm run typecheck` 类型检查（`tsc -b`）
- `npm run test` 单元测试（Vitest）
- `npm run build` 生产构建
- `npm run lint` ESLint（CI 硬门）
- `npm run test:e2e` 真实后端冒烟（手动跑，说明见 [`e2e/README.md`](e2e/README.md)）

CI 在 `master` 的 push 与 PR 上跑以上命令。master 要求 PR + CI 通过。

详细验收计划见
`docs/superpowers/specs/2026-11-10-web-acceptance-remediation-design.md`。
