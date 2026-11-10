# 验收冒烟（Playwright）

四条走真实后端的冒烟：登录 → 判读槽 / 记录纸 / 资讯详情 / Agent 回复。
它不是单元测试的替代品，只回答一个问题：**这套前端在真环境里还走得通吗。**

## 前置

全部手动起，`playwright.config.ts` 刻意不配 `webServer`（后端是另一条 Java 线）：

| 依赖 | 说明 |
| --- | --- |
| 前端 | `npm run dev`（默认 :5173；换端口用 `E2E_BASE_URL`） |
| 后端 | `mvn spring-boot:run`，:8081，`/api` 前缀 |
| MySQL / Redis | 后端会话与数据（本机两套 MySQL，见仓库 `CLAUDE.local.md`） |
| 算法服务 | 判读链路需要 Python gRPC :50051（只看 Agent/资讯时可不验判读） |

## 环境变量

```bash
E2E_USER=<账号> E2E_PASSWORD=<密码> npm run test:e2e
```

- 两个变量缺任意一个：四条用例全部 **skipped**（不红），用于 CI / 无账号机器。
- `E2E_BASE_URL`：默认 `http://localhost:5173`。

首次运行需要浏览器：

```bash
npx playwright install chromium
```

## 失败时

- 截图：`test-results/**/test-failed-*.png`
- trace：`test-results/**/trace.zip`，用 `npx playwright show-trace <file>` 打开

## 为什么不进 CI

CI 没有 MySQL / Redis / 算法服务，也拿不到真实账号；进 CI 只会得到一串环境失败。
发布前手动跑一次即可（见仓库根 `README.md` 的验证段）。
