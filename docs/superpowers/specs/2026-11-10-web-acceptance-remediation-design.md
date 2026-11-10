# Iris 前端上线验收整改 · 设计

- 日期：2026-11-10
- 状态：待评审（设计已口头确认，本文为书面定稿）
- 仓库：`yuwen773/eyes-diagnosis-web`（本目录 `web/`）
- 基线：`fix/p0-clinical-correctness` @ `5536d8a`（P0 临床正确性已修，尚未合入 `master`）
- 范围：前端；后端只冻结契约不实现

## 0. 决策记录

本轮设计由四次确认确定，后续改动若与此冲突，需要显式重新确认：

| 议题 | 决定 |
|---|---|
| 本轮目标 | **上线验收：可靠性 + 信息闭环 + 门禁** |
| 后端 | **可以改后端，先把契约定好；这一轮只改前端** |
| 新闻正文 | **以 HTML 为准，保存时把 Markdown 渲染成 HTML** |
| 旧 HTML 文章编辑回填 | **自己写最小 HTML→Markdown 转换**，不引入 turndown |
| 推进顺序 | **B · 门禁先行** |

项目 `CLAUDE.md` 的硬约束「后端 API 契约已冻结」在本轮的理解是：**不修改任何既有端点的请求/响应**。新增统计聚合接口记为待实现提案（§3），不落地。

## 1. 目标与成功标准

**目标**：让现有六条主线（落地页、判读、记录、资讯、Agent、管理台）在真实后端上可以走完验收，且每个数字、每句承诺都有依据。

**成功标准**：

1. 关键路径不丢用户输入、不串会话、不出现错配结论。
2. 页面上每一个聚合数字都标注了统计口径，且翻页不变。
3. 新闻保存与展示使用同一种格式，旧文章不丢内容。
4. 键盘可以走通全站，焦点不逸出弹窗，焦点环可见。
5. CI 在 `master` 上强制 typecheck + test + build；`master` 只能经 PR 合入。
6. 发布前有一组可重复执行的冒烟脚本。

## 2. 范围

### 2.1 本轮做

| 子项目 | 内容 |
|---|---|
| S1 可靠性 | Agent 发送失败保留输入与附件；历史请求按会话校验；threadId 按用户隔离；记录详情重试；匿名上传 401 后不丢文件；复诊回执可见 |
| S2 可访问性（限缩） | `--fg-3` 与橙色文字对比度 ≥ 4.5:1；Modal/Drawer 焦点陷阱；`outline:none` 让位 `:focus-visible`；Agent 图片预览补 Esc / 关闭按钮 / 焦点恢复 |
| S3 医疗信息闭环 | 统计口径双路径；记录纸呈现 `humanResult / humanSeverity / humanRecommendations`，区分「AI 初判」与「医生修订」；落地页「医生复核」校准为「人工复核」 |
| S4 契约 | 冻结 `GET /diagnosis/stats/my`（不实现）；新闻正文 HTML 化 |
| S5 门禁 | `npm test` 脚本、GitHub Actions、`master` 保护、Playwright 冒烟 |

### 2.2 本轮不做

- **S6 品牌与内容**：Manrope 字标、落地页叙事改写、术语全站统一、404 页、1847 行死组件、7 个未使用依赖。
- **S7 医生 persona**：`doctor` 角色模型、复核队列、按状态筛选、批量复核。
- 44px 触达目标统一、移动端管理入口、读屏 live region 全量补齐（属 S2 完整版）。
- 后端任何代码改动。

### 2.3 明确不变量

- 不修改 `src/styles/tokens.css` 的语义层（`--signal`、`--risk-*`、`--paper-*` 的含义不变），只改取值与兜底。
- 不引入新的运行时依赖。
- 双主题必须同时成立；纸面原语 `--paper-*` 继续不参与翻转。
- 界面术语继续用「判读」，只有「诊断 Agent」保留为产品名。

## 3. 后端契约（冻结提案，本轮不实现）

### 3.1 端点

```
GET /diagnosis/stats/my
```

- 鉴权：已登录用户，按会话身份取数，**不接受任何参数**（无 `userId` 入参，杜绝越权）。
- 响应：沿用 `BaseResponse<T>` 信封。

```json
{
  "code": 0,
  "data": {
    "total": 128,
    "highRisk": 9,
    "awaitingReview": 12,
    "lastReadAt": "2026-11-08 14:32:10"
  },
  "msg": ""
}
```

### 3.2 字段语义

| 字段 | 定义 |
|---|---|
| `total` | 当前用户名下未删除的判读总数（与分页接口 `total` 同源同义） |
| `highRisk` | `aiRejected = 0 AND severity = 'severe'` 的条数（拒识记录无严重度，不计入） |
| `awaitingReview` | `requiresReview = 1` 的条数 |
| `lastReadAt` | 当前用户判读记录 `createTime` 的最大值，格式与列表接口一致（`YYYY-MM-DD HH:mm:ss`）；无记录时为 `null` |

### 3.3 兼容性

- 与 `/diagnosis/list/page/my` 并存，不改变其任何字段。
- 未实现时，网关或 Spring 对未知路径返回 404；前端据此进入降级路径（§4）。
- 只读，无副作用，可缓存；本轮前端按 `staleTime` 无缓存直接请求（每个页面加载一次）。

### 3.4 验收（后端实现时）

同一账号下，分页接口逐页拉满后本地汇总的结果必须与 `/stats/my` 四个字段完全一致；跨越删除、复核、复审状态变化后仍然一致。

## 4. 前端双路径

### 4.1 接口

`src/lib/api.ts` 新增：

```ts
export type MyDiagnosisStats = {
  total: number
  highRisk: number
  awaitingReview: number
  lastReadAt: string | null
}

export function getMyStats() {
  return request<MyDiagnosisStats>("/diagnosis/stats/my", { method: "GET" })
}
```

### 4.2 聚合与降级

`src/lib/records.ts` 新增：

```ts
export type StatsScope = "all" | "page"
export type ScopedStats = { stats: RecordStats; scope: StatsScope }

/** 服务端聚合优先；任何失败都降级到当前页，并把口径标成 page。 */
export async function loadMyStats(
  records: DiagnosisManage[],
  total: number,
): Promise<ScopedStats>
```

规则：

- `getMyStats()` 成功 → `{ stats: 服务端值, scope: "all" }`。
- 抛出任何错误（404 未实现、500、网络）→ `{ stats: summarizeRecords(records, total), scope: "page" }`。
- 不在 JSX 里判断口径；标签文案由 `scope` 一次性决定。

### 4.3 标签

| 位置 | `scope === "all"` | `scope === "page"` |
|---|---|---|
| 总数 | `判读总数 · TOTAL` | `判读总数 · TOTAL`（信封值，本来就是全量） |
| 高风险 | `高风险 · SEVERE` | `本页高风险 · SEVERE` |
| 待复核 | `待人工复核 · REVIEW` | `本页待人工复核 · REVIEW` |
| 最近一次 | `最近判读 · LAST` | `本页最近 · LAST` |

`scope === "page"` 时保留现有一句口径说明，改为：「总数是你名下的全部判读；带「本页」的三项只统计当前这一页，翻页会变。服务端聚合上线后会自动切到全量。」

### 4.4 调用点

- `src/pages/RecordsPage.tsx`：KPI 改为由 `loadMyStats` 提供，请求与列表并行；列表失败但统计成功时，KPI 仍显示（列表区域单独报错）。
- `src/pages/ProfilePage.tsx`：删除 `pageSize: 100` 的取数 hack，KPI 走同一函数；列表部分保留自己的查询。

## 5. 新闻正文 HTML 化

### 5.1 保存

`src/pages/admin/AdminNewsEditPage.tsx` 保存时：

```ts
// 新建文章、或正文被编辑过：Markdown → HTML
const content = form.contentDirty ? renderMarkdown(form.content) : form.content
```

旧版 HTML 文章在未改动正文的情况下原样提交（见 §5.2）。

- 与编辑页预览（`:123`）使用同一个渲染器，保证「所见即所存」。
- 请求体字段不变（仍是 `content`），后端、详情页 `sanitizeNewsHtml`、摘要剥标签逻辑全部不改。
- 保存前先 `renderMarkdown` 再提交；不做二次转义。

### 5.2 旧 HTML 文章回填

新增 `src/lib/htmlToMarkdown.ts`：

```ts
export function htmlToMarkdown(html: string): string
```

- 只处理 `sanitize.ts` 的 `ALLOWED_TAGS` 子集：`p, br, hr, h2–h4, strong/b, em/i, ul, ol, li, a, img, blockquote, code, pre`；`u/s/span/div` 剥标签保留文本。
- 未知标签剥离但保留文本；嵌套列表按缩进输出。
- 空段落折叠为单个空行。
- 文件内注明「有损转换」与支持范围。

编辑页加载旧文章时：

- 若 `content` 含 HTML 标签（`/<[a-z][\s\S]*>/i`），用 `htmlToMarkdown` 转成 Markdown 填入编辑器，同时把原始 HTML 留在组件状态里。
- 表单上方显示一条提示：「本文为旧版 HTML，正文已转换为 Markdown 供编辑；**一旦修改并保存，将以 Markdown 重写正文**。」
- **正文未被修改时，原样提交原始 HTML**，不做有损往返。只有正文被编辑过才执行 `renderMarkdown(form.content)`。
- 编辑过再保存时，`renderMarkdown(htmlToMarkdown(html))` 必须保留标题、段落、加粗、列表、链接、图片。

### 5.3 测试

- `htmlToMarkdown` 单测：每种受支持标签各一条、嵌套列表一条、未知标签一条、纯文本一条。
- `renderMarkdown(htmlToMarkdown(html))` 往返用例：对三种典型旧文章结构断言关键文本与标签仍在。

## 6. 批次

每批一个 PR，按 B0 → B4 顺序合入。B0 先落地，后续每批都靠它拦。

### B0 · 门禁

| 项 | 内容 |
|---|---|
| 脚本 | `package.json` 新增 `"test": "vitest run"` |
| CI | 新增 `.github/workflows/verify.yml`：`push` / `pull_request` 到 `master`，Node 22，`npm ci` → `npm run typecheck` → `npm run test` → `npm run build`；`lint` 先 `continue-on-error: true` |
| 分支保护 | `master` 要求 PR + CI 通过；用 `gh api` 设置，无权限则列入人工清单 |
| 验收 | 推送一个含类型错误的临时分支，CI 必须失败；删除临时分支 |

### B1 · 数据正确性

| 项 | 文件 | 做法 |
|---|---|---|
| 统计双路径 | `src/lib/api.ts`、`src/lib/records.ts`、`RecordsPage.tsx`、`ProfilePage.tsx` | §4 |
| 详情重试 | `src/pages/RecordsPage.tsx` | 新增 `detailKey` 计数，详情 effect 依赖 `[openId, detailKey]`；`onRetry` 改为 `setDetailKey(k => k + 1)`，不再调用 `toggle`（它会收起面板） |
| 复诊回执 | `src/pages/RecordsPage.tsx` | 区块渲染条件改为「记录非拒识且有复审状态」（`!item.aiRejected && item.reexamineStatus != null`），不再只由 `canRequestReexamine` 决定。内部三态：`detail.reexamined || status === 2` → 「申请已提交」回执；`status === 1` → 「申请复诊」按钮；`status === 3` → 「已复审」标签 + 可再次申请。这样重新打开一条「复审中」的记录也能看到状态 |
| 新闻正文 | `AdminNewsEditPage.tsx`、新 `src/lib/htmlToMarkdown.ts` | §5 |
| 匿名上传保文件 | 新 `src/lib/pendingUpload.ts`、`DiagnosisPage.tsx` | 401 时把 `File` 存入模块级变量（SPA 内导航不丢），登录返回后自动恢复并提示「已为你保留上次选择的影像」；恢复后立即清空，避免跨用户泄漏 |

验收：

- 翻页时「本页高风险」数字可以变，但标签必须写「本页」；`/stats/my` 上线后数字与标签同时切到全量。
- 记录详情加载失败点「重试」，面板保持展开并重新请求。
- 提交复诊后必须看到「申请已提交，等待医生安排复诊。」
- 打开旧 HTML 文章 → 编辑 → 不改内容保存 → 详情页排版与保存前一致。
- 未登录上传 → 跳登录 → 返回 `/diagnosis` → 影像仍在。

### B2 · Agent 可靠性

| 项 | 文件 | 做法 |
|---|---|---|
| 发送失败保留输入 | `src/components/agent/ChatInput.tsx`、`AgentPage.tsx` | `onSend` 签名改为 `(text, files) => Promise<boolean>`；`true` 才清空文本与附件，`false` 时保留并恢复焦点 |
| 历史竞态 | `src/pages/AgentPage.tsx` | `loadHistoryMessages(id)` 在写入前比较 `threadIdRef.current === id`，不等则丢弃 |
| threadId 隔离 | `src/pages/AgentPage.tsx` | key 改为 `agent_current_thread_id:${userId ?? "anon"}`；`useEffect` 依赖 `user?.id`，用户变化时清空内存中的 `threadId` 并按新 key 重新读取 |
| 停止按钮失效 | `src/lib/agentStream.ts`、`AgentPage.tsx` | 单槽 `abortRef` 改为自增 token：每次流持有自己的 token，`abort` 只中止当前 token；旧流 `finally` 只清理自己的 token |
| 附带修正 | `src/pages/AgentPage.tsx` | `const uploader = useMemo(() => useAgentUpload(), [])` 改为模块级单例或在 `useAgentUpload` 内接入 `useRef` 惰性初始化；`threadIdRef.current = threadId` 移入 `useEffect` |

验收：

- 断网后发送：文字与图片仍留在输入框，可见错误提示。
- 快速切换会话 A → B：A 的历史响应不得出现在 B。
- 两个账号交替登录：不共享上次打开的会话。
- 流式回答中点停止：新发起的流仍可被停止。

### B3 · 可访问性

| 项 | 文件 | 做法 |
|---|---|---|
| 对比度 | `src/styles/tokens.css` | `--fg-3` 调到浅底 ≥ 4.5:1（起点 `#6b7277`，以实测为准）；复核暗色主题下 `--fg-3` 与 `--signal` 文字对比度 |
| 焦点环 | `admin.css`、`agent.css`、`news.css`、`records.css`、`app.css` | 删除压掉 `:focus-visible` 的 `outline: none`（或降特异度），保留全局 1px 焦点环 |
| 模态焦点 | `src/components/admin/Modal.tsx`、`Drawer.tsx` | 打开时对背景根节点加 `inert`；Tab 循环限制在弹窗内；关闭后焦点回到触发元素 |
| 图片预览 | `src/pages/AgentPage.tsx` | 支持 Esc、右上角关闭按钮、打开时焦点进入、关闭后焦点回到缩略图 |
| lint 转硬门 | `.github/workflows/verify.yml` | 20 个 error 清零后移除 `continue-on-error` |

验收：

- 键盘 Tab 走完全站，任何可聚焦元素都有可见焦点环。
- 弹窗打开时 Tab 不得触达背后控件。
- 对比度脚本（或手算）记录三条：浅底 `--fg-3`、深底 `--fg-3`、橙色文字。
- `npm run lint` 输出 0 error。

### B4 · 验收

| 项 | 内容 |
|---|---|
| 冒烟 | 新增 `e2e/`（Playwright）：① 登录 → 判读页选图 → 出记录纸；② 记录页展开一条 → 详情可见；③ 资讯列表 → 详情；④ Agent 发一条消息 → 收到回复。**不进 CI**，依赖真后端（:8081 + MySQL + Redis） |
| 说明 | `e2e/README.md`：起停环境、账号准备、执行命令 |
| 视觉 | 双主题 × 桌面 1440 / 移动 390，覆盖落地页、判读、记录、资讯、Agent、管理台 |
| 文档 | 把本 spec 与门禁说明链入 `README.md`；`DESIGN.md` §12 的已知债务按本轮结果更新 |

## 7. 门禁

1. **lint 晚一步卡**：20 个 error 现在会让 CI 红，而它们在 B3 修复范围内。B3 结束时必须清零并转硬门；不允许把 `continue-on-error` 留到上线。
2. **E2E 不进 CI**：需要真后端，CI 起 MySQL + Redis + Python 算法不划算。它是发布前必跑项。
3. **`master` 保护**：需要仓库 admin 权限。若当前凭据无法设置，列入人工清单，不声称已完成。

## 8. 风险

| 风险 | 处置 |
|---|---|
| 落地页承诺「可疑病例进入医生复核队列」，本轮不做医生 persona | 文案校准为「人工复核队列」；复核结论在 B1 呈现给患者。承诺与能力对齐 |
| 统计接口后端未实现 | 前端降级到「本页」并明说；验收清单标注「待后端」 |
| E2E 不进 CI | B4 作为发布前必跑项写入 README |
| 后端契约冻结 | 本轮零后端改动；§3 只作为下一轮输入 |
| 新样式破坏双主题 / 纸面原语 | B3 改 CSS 后必须双主题截图比对 |
| 旧 HTML → Markdown 有损 | 只影响被编辑的旧文章；保存前提示；往返用例兜底 |
| P0 分支未合入 `master` | B1 开始前先确认 P0 已合；否则从 `fix/p0-clinical-correctness` 起分支 |

## 9. 验收矩阵（人工）

| 场景 | 期望 |
|---|---|
| 判读进行中拖入新图 | 不出现旧图结论；提示「判读进行中」 |
| 记录列表翻页 | 带「本页」的三项可变，标签必须写明；总数不变 |
| 同一记录在列表与记录纸 | 置信度一致、带 `%`、带可信度标签 |
| 网关 502 / 非 JSON | 不静默登出、不卡 loading，显示可重试错误 |
| 后台弹窗 Tab 遍历 | 焦点不逸出；关闭后回到触发按钮 |
| 手机 390px 记录列表 | 风险等级可见 |
| 提交复诊 | 看到成功回执 |
| 深色主题故障 toast | 无亮白边框；info 态有左侧色标 |
| 任意 `.overline` 标签 | 上方无来源不明的横线 |
| 匿名用户上传 | 登录返回后文件仍在 |
| 管理台表格 | 无裂图；按钮文字不折行 |
| 新闻旧文章编辑保存 | 内容不丢，格式不劣化 |

## 10. 与既有文档的关系

- 设计真源仍是仓库根 `DESIGN.md`（白色仪器 / 信号橙）；本 spec 不改变设计语言，只修可访问性与正确性。
- `docs/backend-split.md` 与 Python 线无关：本仓库是独立产品前端。
- 本 spec 是 `writing-plans` 的输入；实现计划按批次拆任务，不在此展开。
