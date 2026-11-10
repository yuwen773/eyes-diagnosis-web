# Iris 前端上线验收整改 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Iris 前端在真实后端上走完上线验收——关键路径不丢输入、聚合数字口径诚实、新闻格式统一、键盘可用、CI 卡住 master。

**Architecture:** 按 B0–B4 五批推进，每批一个 PR。B0 先落 CI 与测试脚本；B1 修数据正确性（统计双路径、新闻 HTML 化、匿名上传、复诊回执）；B2 修 Agent 可靠性（发送失败保留、历史竞态、threadId 隔离、停止令牌）；B3 修可访问性并把 lint 转成硬门；B4 出冒烟脚本与验收文档。所有改动只在前端，后端契约冻结在 spec §3，不在本轮实现。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Vitest 5 + Testing Library、Playwright（仅 devDependency）、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-11-10-web-acceptance-remediation-design.md`

## Global Constraints

- 不修改任何既有后端端点的请求/响应；`GET /diagnosis/stats/my` 只是冻结提案，本轮不实现。
- 不引入新的**运行时**依赖；Playwright 只做 devDependency。
- 双主题必须同时成立；纸面原语 `--paper-*` 不参与根主题翻转（`html.dark .is-sheet` 仍钉回纸白）。
- 界面术语用「判读」；只有「诊断 Agent」保留为产品名。
- 每批结束必须 `npm run typecheck && npm run test && npm run build` 全绿。
- 提交信息用中文约定式：`type(scope): 描述`，正文可用 `-` 列表。
- 删除任何文件前，先 `git grep -n "<名字>" HEAD` 确认无引用（脏工作区的构建绿不算证据）。

## Review Focus

这五类输入/失败模式 spec 没逐条写测试，但用户最可能撞上；每个都在对应任务里补了测试。

1. **`/diagnosis/stats/my` 返回 401/500/非 JSON**：必须降级到「本页」口径并把标签写清，不能出现空白 KPI 或错误的全量数字。
2. **旧 HTML 文章含嵌套列表、相对路径图片、HTML 实体**：转换后正文不得丢字、丢链接、丢图片。
3. **Markdown 正文里手写 HTML 标签**（渲染器 `html: false` 会把它们转义）：保存后页面必须原样显示文本，不得出现双重转义，也不得变成可执行 HTML。
4. **Agent 上传成功但发送失败**：文字与附件必须留在输入框；重试不得重复插入一条用户消息。
5. **`localStorage` 不可用（无痕/被禁用）**：读取与写入 threadId 不得抛错，页面必须照常渲染。

---

### Task 1: B0 测试脚本与 CI 门禁

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/verify.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: `npm run test` 可用；CI job 名 `verify`。

- [ ] **Step 1: 确认当前缺少测试脚本**

Run: `npm run test`
Expected: 失败，输出 `Missing script: "test"`。

- [ ] **Step 2: 加脚本**

`package.json` 的 `scripts` 增加一行：

```json
"test": "vitest run"
```

- [ ] **Step 3: 跑测试，确认基线**

Run: `npm run test`
Expected: 16 个测试文件全部通过，0 失败。

- [ ] **Step 4: 新建 workflow**

`.github/workflows/verify.yml`：

```yaml
name: verify

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
      # B3 结束前 lint 只报警不拦合；Task 14 会删掉这一行。
      - run: npm run lint
        continue-on-error: true
```

- [ ] **Step 5: 本地跑一遍与 CI 等价的命令**

Run: `npm ci && npm run typecheck && npm run test && npm run build`
Expected: 全部成功，`dist/` 生成。

- [ ] **Step 6: README 补门禁说明**

把 README 顶部模板说明替换为项目说明，并加一节：

```markdown
## 验证

- `npm run typecheck` 类型检查
- `npm run test` 单元测试（Vitest）
- `npm run build` 生产构建
- `npm run lint` ESLint（B3 起为硬门）

CI 在 `master` 的 push 与 PR 上跑以上命令。master 要求 PR + CI 通过。
详细验收计划见 `docs/superpowers/specs/2026-11-10-web-acceptance-remediation-design.md`。
```

- [ ] **Step 7: 提交**

```bash
git add package.json .github/workflows/verify.yml README.md
git commit -m "ci(web): 添加 master 验证流水线与测试脚本"
```

- [ ] **Step 8: 手动开分支保护（人工步骤，不假装完成）**

GitHub → Settings → Branches → Add rule：`master`，勾选 “Require a pull request before merging” 与 “Require status checks to pass”，状态检查选 `verify`。若用 `gh`：

```bash
gh api -X PUT repos/yuwen773/eyes-diagnosis-web/branches/master/protection \
  -f required_status_checks[strict]=true \
  -f 'required_status_checks[contexts][]=verify' \
  -f enforce_admins=true \
  -f required_pull_request_reviews[required_approving_review_count]=0 \
  -f restrictions=
```

若凭据无 admin 权限，把这条写进 PR 描述，不要勾掉。

---

### Task 2: 统计聚合数据层（双路径）

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/records.ts`
- Test: `src/lib/records.test.ts`

**Interfaces:**
- Produces:
  - `type MyDiagnosisStats = { total: number; highRisk: number; awaitingReview: number; lastReadAt: string | null }`
  - `getMyStats(): Promise<MyDiagnosisStats>`
  - `type StatsScope = "all" | "page"`
  - `type ScopedStats = { stats: RecordStats; scope: StatsScope }`
  - `loadMyStats(records: DiagnosisManage[], total: number): Promise<ScopedStats>`
  - `statsLabels(scope: StatsScope): { total: string; highRisk: string; awaitingReview: string; lastReadAt: string }`

- [ ] **Step 1: 写失败测试**

在 `src/lib/records.test.ts` 顶部加 mock，并追加：

```ts
import { beforeEach, vi } from "vitest"
import { ApiError } from "./api"

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>()
  return { ...actual, getMyStats: vi.fn() }
})
import { getMyStats } from "./api"
import { loadMyStats, statsLabels } from "./records"

const mockedStats = vi.mocked(getMyStats)

beforeEach(() => {
  mockedStats.mockReset()
})

describe("loadMyStats", () => {
  const serverStats = {
    total: 128,
    highRisk: 9,
    awaitingReview: 12,
    lastReadAt: "2026-11-08 14:32:10",
  }

  it("服务端聚合可用时用全量口径", async () => {
    mockedStats.mockResolvedValueOnce(serverStats)
    await expect(loadMyStats([row({ severity: "severe" })], 1)).resolves.toEqual({
      stats: serverStats,
      scope: "all",
    })
  })

  it("接口未实现（404）时降级到当前页并标注 page", async () => {
    mockedStats.mockRejectedValueOnce(new ApiError(404, "服务返回 404"))
    const result = await loadMyStats([row({ severity: "severe" })], 37)
    expect(result.scope).toBe("page")
    expect(result.stats).toEqual({
      total: 37,
      highRisk: 1,
      awaitingReview: 0,
      lastReadAt: "2026-11-01 10:00:00",
    })
  })

  it("网络错误同样降级，不向上抛", async () => {
    mockedStats.mockRejectedValueOnce(new ApiError(-1, "网络不可用"))
    await expect(loadMyStats([], 0)).resolves.toMatchObject({ scope: "page" })
  })
})

describe("statsLabels", () => {
  it("全量口径不带「本页」", () => {
    expect(statsLabels("all")).toEqual({
      total: "判读总数 · TOTAL",
      highRisk: "高风险 · SEVERE",
      awaitingReview: "待人工复核 · REVIEW",
      lastReadAt: "最近判读 · LAST",
    })
  })

  it("本页口径必须写明「本页」", () => {
    expect(statsLabels("page")).toEqual({
      total: "判读总数 · TOTAL",
      highRisk: "本页高风险 · SEVERE",
      awaitingReview: "本页待人工复核 · REVIEW",
      lastReadAt: "本页最近 · LAST",
    })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/lib/records.test.ts`
Expected: FAIL，`loadMyStats is not a function`。

- [ ] **Step 3: 实现 `getMyStats`**

`src/lib/api.ts`，放在 `getMyDiagnosis` 之前：

```ts
export type MyDiagnosisStats = {
  total: number
  highRisk: number
  awaitingReview: number
  lastReadAt: string | null
}

/** 服务端聚合。接口未上线时返回 404，调用方据此降级。 */
export function getMyStats() {
  return request<MyDiagnosisStats>("/diagnosis/stats/my", { method: "GET" })
}
```

- [ ] **Step 4: 实现 `loadMyStats` 与 `statsLabels`**

`src/lib/records.ts`：`loadMyStats` 先 `try { const stats = await getMyStats(); return { stats, scope: "all" } } catch { return { stats: summarizeRecords(records, total), scope: "page" } }`。`statsLabels` 按 spec §4.3 的四个字符串返回，`page` 时后三项加「本页」前缀。

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -- src/lib/records.test.ts`
Expected: PASS，全部用例通过。

- [ ] **Step 6: 提交**

```bash
git add src/lib/api.ts src/lib/records.ts src/lib/records.test.ts
git commit -m "feat(records): 统计聚合支持服务端全量口径与分页降级"
```

---

### Task 3: 记录页接入双路径 + 详情重试 + 复诊三态

**Files:**
- Modify: `src/lib/records.ts`（追加 `reexamineView`）
- Modify: `src/pages/RecordsPage.tsx`
- Test: `src/lib/records.test.ts`、新建 `src/pages/RecordsPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 `loadMyStats`、`statsLabels`。
- Produces:
  - `type ReexamineView = "receipt" | "request" | "reviewed" | null`
  - `reexamineView(item: DiagnosisManage, reexamined: boolean): ReexamineView`
  - `RecordsPage` 的 KPI 读 `ScopedStats`。

- [ ] **Step 1: 写 `reexamineView` 的失败测试**

`src/lib/records.test.ts` 追加：

```ts
import { reexamineView } from "./records"

describe("reexamineView", () => {
  it("复审中显示回执，重新打开也能看到", () => {
    expect(reexamineView(row({ reexamineStatus: 2 }), false)).toBe("receipt")
  })
  it("提交成功后的乐观态优先显示回执", () => {
    expect(reexamineView(row({ reexamineStatus: 2 }), true)).toBe("receipt")
  })
  it("未复审与已复审都显示可申请", () => {
    expect(reexamineView(row({ reexamineStatus: 1 }), false)).toBe("request")
    expect(reexamineView(row({ reexamineStatus: 3 }), false)).toBe("reviewed")
  })
  it("拒识或没有复审状态时不渲染整块", () => {
    expect(reexamineView(row({ aiRejected: true }), false)).toBeNull()
    expect(reexamineView(row({ reexamineStatus: undefined }), false)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/lib/records.test.ts`
Expected: FAIL，`reexamineView is not a function`。

- [ ] **Step 3: 实现 `reexamineView`**

`src/lib/records.ts`：

```ts
export type ReexamineView = "receipt" | "request" | "reviewed" | null

export function reexamineView(item: DiagnosisManage, reexamined: boolean): ReexamineView {
  if (item.aiRejected || item.reexamineStatus == null) return null
  if (reexamined || item.reexamineStatus === 2) return "receipt"
  return item.reexamineStatus === 3 ? "reviewed" : "request"
}
```

- [ ] **Step 4: 写记录页 KPI 失败测试**

新建 `src/pages/RecordsPage.test.tsx`（jsdom），按 `src/pages/AgentPage.test.tsx` 的模式 mock `@/lib/session`、stub `matchMedia`，并 mock `@/lib/api`：

```tsx
// @vitest-environment jsdom
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "anon", user: null, signIn: vi.fn(), signOut: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    listMyDiagnoses: vi.fn(),
    getMyStats: vi.fn(),
  }
})

it("服务端聚合未上线时，三项计数标注「本页」", async () => {
  vi.mocked(listMyDiagnoses).mockResolvedValue({ records: [], total: 0 })
  vi.mocked(getMyStats).mockRejectedValue(new ApiError(404, "服务返回 404"))
  render(<MemoryRouter><ThemeProvider><RecordsPage /></ThemeProvider></MemoryRouter>)
  expect(await screen.findByText("本页高风险 · SEVERE")).toBeTruthy()
})

it("服务端聚合可用时使用全量口径", async () => {
  vi.mocked(listMyDiagnoses).mockResolvedValue({ records: [], total: 0 })
  vi.mocked(getMyStats).mockResolvedValue({ total: 128, highRisk: 9, awaitingReview: 12, lastReadAt: null })
  render(<MemoryRouter><ThemeProvider><RecordsPage /></ThemeProvider></MemoryRouter>)
  expect(await screen.findByText("高风险 · SEVERE")).toBeTruthy()
  expect(screen.queryByText("本页高风险 · SEVERE")).toBeNull()
})
```

- [ ] **Step 5: 跑测试确认失败**

Run: `npm run test -- src/pages/RecordsPage.test.tsx`
Expected: FAIL（仍渲染旧的固定文案）。

- [ ] **Step 6: 改 KPI 与标签**

`RecordsPage.tsx`：

```ts
const [scoped, setScoped] = useState<ScopedStats | null>(null)

useEffect(() => {
  if (list.key !== requestKey || !data) return
  let alive = true
  void loadMyStats(records, data.total ?? 0).then((value) => {
    if (alive) setScoped(value)
  })
  return () => {
    alive = false
  }
}, [data, records, list.key, requestKey])

const stats = scoped?.stats ?? summarizeRecords(records, data?.total ?? 0)
const labels = statsLabels(scoped?.scope ?? "page")
```

四个 `readout__label` 改用 `labels.total / highRisk / awaitingReview / lastReadAt`。口径说明改为：`scope === "page"` 时显示「总数是你名下的全部判读；带「本页」的三项只统计当前这一页（第 {page} / {pages} 页），翻页会变。服务端聚合上线后会自动切到全量。」；`scope === "all"` 时整段不渲染。

- [ ] **Step 7: 修详情重试与复诊三态**

`RecordsPage.tsx`：

- 新增 `const [detailKey, setDetailKey] = useState(0)`。
- `toggle(id)`：展开时同时 `setDetail({ id, result: null, fault: null, reexamined: false, submitting: false })`。
- 详情 effect 依赖改 `[openId, detailKey]`，**effect 体内删除同步 `setDetail`**，只保留 `getMyDiagnosis`。
- 删除「翻页收起」effect；改为在 `goPage()` 与 `retry()` 里调用 `closeDetail()`。
- 新增 `retryDetail()`：把当前 detail 的 `result/fault` 清空后 `setDetailKey(k => k + 1)`。
- `FaultPanel` 的 `onRetry={() => toggle(item.id)}` 改为 `onRetry={retryDetail}`。
- 复诊区块改用 `reexamineView(item, detail.reexamined)`：
  - `"receipt"` → 现有回执文案；
  - `"request"` → 「申请复诊」按钮；
  - `"reviewed"` → `RiskTag`「已复审」+「再次申请复诊」按钮；
  - `null` → 不渲染。

- [ ] **Step 8: 跑测试与类型检查**

Run: `npm run test && npm run typecheck`
Expected: 全绿。

- [ ] **Step 9: 提交**

```bash
git add src/lib/records.ts src/lib/records.test.ts src/pages/RecordsPage.tsx src/pages/RecordsPage.test.tsx
git commit -m "fix(records): 统计口径标注、详情重试与复诊回执可见"
```

---

### Task 4: 个人中心接入同一套统计

**Files:**
- Modify: `src/pages/ProfilePage.tsx`

**Interfaces:**
- Consumes: `loadMyStats`、`statsLabels`（Task 2）。

- [ ] **Step 1: 替换取数**

删除 `pageSize: 100` 的统计请求与本地 `summarizeRecords` 调用，保留现有 `statsState` / `statsFault` / `statsKey` 的重试语义，把值换成 `ScopedStats`：

```ts
useEffect(() => {
  if (!user) return
  let alive = true
  listMyDiagnoses({ current: 1, pageSize: 10 }).then(
    (value) =>
      loadMyStats(value.records ?? [], value.total ?? 0).then((next) => {
        if (alive) setScoped(next)
      }),
    (cause) => {
      if (!alive) return
      setStatsState((prev) => ({ ...prev, key: statsKey, fault: describeError(cause) }))
    },
  )
  return () => {
    alive = false
  }
}, [user, statsKey])
```

`setScoped` 是新状态 `const [scoped, setScoped] = useState<ScopedStats | null>(null)`；错误路径沿用页面已有的 `statsState.fault` 字段。

- [ ] **Step 2: 改标签**

「高风险 · SEVERE」改用 `statsLabels(scoped?.scope ?? "page").highRisk`；「判读总数」用 `.total`。`scope === "page"` 时在统计条下方复用记录页同一句口径说明（把该句抽成 `src/lib/records.ts` 的导出常量 `STATS_SCOPE_NOTE(scope)` 不必要——直接在本页写同一句，两处文案必须逐字一致）。

- [ ] **Step 3: 验证**

Run: `npm run typecheck && npm run test`
Expected: 全绿。

- [ ] **Step 4: 提交**

```bash
git add src/pages/ProfilePage.tsx
git commit -m "fix(profile): 统计改走统一聚合与口径标注"
```

---

### Task 4B: 记录纸呈现人工复核结论（属 B1）

**Files:**
- Modify: `src/components/RecordSheet.tsx`
- Modify: `src/pages/LandingPage.tsx`、`src/components/AgentScreenDeck.tsx`
- Test: 新建 `src/components/RecordSheet.test.tsx`

**Interfaces:**
- Consumes: `DiagnosisResult.humanResult / humanSeverity / humanRecommendations / humanReviewNote`（`src/lib/api.ts` 已有）。
- Produces: 记录纸上新增「人工复核结论 · HUMAN REVIEW」区块，与「AI 判读结果」并列且可区分。

- [ ] **Step 1: 写失败测试**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { RecordSheet } from "./RecordSheet"

const result = {
  result: "糖尿病视网膜病变",
  humanResult: "复核：中度非增殖期，建议 6 个月复查",
  humanSeverity: "MODERATE",
  humanRecommendations: "控制血糖\n6 个月后复查",
  humanReviewStatus: "APPROVED",
}

it("有复核结论时同时展示 AI 初判与人工结论", () => {
  render(<RecordSheet result={result} />)
  expect(screen.getByText(/AI 判读结果/)).toBeTruthy()
  expect(screen.getByText("复核：中度非增殖期，建议 6 个月复查")).toBeTruthy()
  expect(screen.getByText("人工复核结论 · HUMAN REVIEW")).toBeTruthy()
})

it("没有复核结论时不渲染该区块", () => {
  render(<RecordSheet result={{ result: "正常" }} />)
  expect(screen.queryByText(/人工复核结论/)).toBeNull()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/components/RecordSheet.test.tsx`
Expected: FAIL，找不到复核结论文案。

- [ ] **Step 3: 实现区块**

在 AI 主体 `</div>`（`sheet__body` 结束）之后、八类概率 section 之前插入，仅当 `result.humanResult` 非空时渲染：

```tsx
<section className="sheet__section">
  <div className="sheet__section-head">
    <span className="overline">人工复核结论 · HUMAN REVIEW</span>
    {result.humanSeverity ? (
      <span className="overline">
        严重程度 ·{" "}
        <RiskTag risk={severityRisk(result.humanSeverity)}>
          {severityLabel(result.humanSeverity)}
        </RiskTag>
      </span>
    ) : null}
  </div>
  <p className="sheet__verdict">{result.humanResult}</p>
  {result.humanRecommendations ? (
    <ol className="recos">
      {result.humanRecommendations.split("\n").filter(Boolean).map((line) => (
        <li key={line}>
          <span className="recos__body">{line}</span>
        </li>
      ))}
    </ol>
  ) : null}
  {result.humanReviewNote ? <p className="sheet__note">{result.humanReviewNote}</p> : null}
</section>
```

样式优先复用现有 `sheet__section` / `sheet__verdict` / `recos`；只有区块与 AI 区块需要视觉区分时才加一个 `data-review="human"` 钩子和 1px 左侧信号色竖线，不新增大面积底色。

- [ ] **Step 4: 校准「医生复核」文案**

以下三处改为「人工复核」，其余不动：

- `src/pages/LandingPage.tsx:67` 与 `:251`
- `src/components/RecordSheet.tsx:177`
- `src/components/AgentScreenDeck.tsx:75`

- [ ] **Step 5: 验证**

Run: `npm run test -- src/components/RecordSheet.test.tsx && npm run typecheck`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/RecordSheet.tsx src/components/RecordSheet.test.tsx src/pages/LandingPage.tsx src/components/AgentScreenDeck.tsx
git commit -m "feat(record): 记录纸呈现人工复核结论并校准复核文案"
```

---

### Task 5: 新闻正文 HTML 化与旧文回填

**Files:**
- Create: `src/lib/htmlToMarkdown.ts`
- Test: `src/lib/htmlToMarkdown.test.ts`
- Modify: `src/pages/admin/AdminNewsEditPage.tsx`

**Interfaces:**
- Produces: `htmlToMarkdown(html: string): string`。

- [ ] **Step 1: 写失败测试**

`src/lib/htmlToMarkdown.test.ts`（node 环境即可）：

```ts
import { describe, expect, it } from "vitest"
import { htmlToMarkdown } from "./htmlToMarkdown"
import { renderMarkdown } from "./markdown"

describe("htmlToMarkdown", () => {
  it("标题按层级转井号", () => {
    expect(htmlToMarkdown("<h2>一</h2><h3>二</h3><h4>三</h4>")).toBe("## 一\n\n### 二\n\n#### 三")
  })
  it("段落之间留空行", () => {
    expect(htmlToMarkdown("<p>甲</p><p>乙</p>")).toBe("甲\n\n乙")
  })
  it("加粗与斜体", () => {
    expect(htmlToMarkdown("<p><strong>粗</strong>与<em>斜</em></p>")).toBe("**粗**与*斜*")
  })
  it("链接与图片", () => {
    expect(htmlToMarkdown('<p><a href="https://x.test">文字</a><img src="/a.png" alt="图"></p>')).toBe(
      "[文字](https://x.test)![图](/a.png)",
    )
  })
  it("无序与有序列表", () => {
    expect(htmlToMarkdown("<ul><li>甲</li><li>乙</li></ul>")).toBe("- 甲\n- 乙")
    expect(htmlToMarkdown("<ol><li>甲</li><li>乙</li></ol>")).toBe("1. 甲\n2. 乙")
  })
  it("嵌套列表按缩进输出", () => {
    expect(htmlToMarkdown("<ul><li>甲<ul><li>甲一</li></ul></li></ul>")).toBe("- 甲\n  - 甲一")
  })
  it("引用、分隔线与换行", () => {
    expect(htmlToMarkdown("<blockquote><p>引</p></blockquote>")).toBe("> 引")
    expect(htmlToMarkdown("<p>甲</p><hr><p>乙</p>")).toBe("甲\n\n---\n\n乙")
    expect(htmlToMarkdown("<p>甲<br>乙</p>")).toBe("甲\n乙")
  })
  it("未知标签剥标签保留文本", () => {
    expect(htmlToMarkdown('<div><span class="x">甲</span>乙</div>')).toBe("甲乙")
  })
  it("解码 HTML 实体", () => {
    expect(htmlToMarkdown("<p>a &amp; b &lt; c</p>")).toBe("a & b < c")
  })
  it("代码块转为围栏", () => {
    expect(htmlToMarkdown("<pre><code>const a = 1</code></pre>")).toBe("```\nconst a = 1\n```")
  })
})

describe("保存链路", () => {
  it("Markdown 里手写的 HTML 被转义，不会变成可执行标签", () => {
    const saved = renderMarkdown(htmlToMarkdown("<p>正文</p>") + "\n\n<div>手写</div>")
    expect(saved).toContain("正文")
    expect(saved).toContain("&lt;div&gt;")
    expect(saved).not.toContain("<div>手写</div>")
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/lib/htmlToMarkdown.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

用 `DOMParser` 解析 `text/html`，递归遍历节点生成 Markdown。**不要**用正则剥标签——嵌套与实体都会错。行内元素（strong/em/a/img/code）在行内拼接，块级元素（p/h2-h4/ul/ol/li/blockquote/pre/hr）各占一段。文件头注明「有损转换，只覆盖 sanitize.ts 的 ALLOWED_TAGS 子集」。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- src/lib/htmlToMarkdown.test.ts`
Expected: PASS。

- [ ] **Step 5: 改动编辑页**

`AdminNewsEditPage.tsx`：

- 新增状态：`const [legacyHtml, setLegacyHtml] = useState<string | null>(null)`、`const [contentDirty, setContentDirty] = useState(false)`。
- 加载成功时：`const raw = data.content ?? ""; const isHtml = /<[a-z][\s\S]*>/i.test(raw); setLegacyHtml(isHtml ? raw : null); setForm({ ..., content: isHtml ? htmlToMarkdown(raw) : raw })`。
- 正文 textarea 的 `onChange` 里 `setContentDirty(true)`。
- 编辑区上方：`legacyHtml` 非空时渲染提示「本文为旧版 HTML，正文已转换为 Markdown 供编辑；一旦修改并保存，将以 Markdown 重写正文。」
- `onSubmit` 里：

```ts
const content = legacyHtml && !contentDirty ? legacyHtml : renderMarkdown(form.content)
```

其余字段与上送方式不变。

- [ ] **Step 6: 验证**

Run: `npm run typecheck && npm run test && npm run build`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/lib/htmlToMarkdown.ts src/lib/htmlToMarkdown.test.ts src/pages/admin/AdminNewsEditPage.tsx
git commit -m "feat(news): 正文保存时渲染为 HTML，旧文按 Markdown 回填"
```

---

### Task 6: 匿名上传不丢文件

**Files:**
- Create: `src/lib/pendingUpload.ts`
- Test: `src/lib/pendingUpload.test.ts`
- Modify: `src/pages/DiagnosisPage.tsx`

**Interfaces:**
- Produces: `rememberPendingUpload(file: File): void`、`takePendingUpload(): File | null`、`clearPendingUpload(): void`。`take` 读出后立即清空。

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { clearPendingUpload, rememberPendingUpload, takePendingUpload } from "./pendingUpload"

const file = () => new File(["x"], "eye.jpg", { type: "image/jpeg" })

describe("pendingUpload", () => {
  beforeEach(() => clearPendingUpload())

  it("取出一次后即清空，避免跨账号泄漏", () => {
    rememberPendingUpload(file())
    expect(takePendingUpload()?.name).toBe("eye.jpg")
    expect(takePendingUpload()).toBeNull()
  })

  it("没有暂存时返回 null", () => {
    expect(takePendingUpload()).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/lib/pendingUpload.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

模块级 `let pending: File | null = null`；三个函数按 Interfaces 实现。

- [ ] **Step 4: 接进判读页**

`DiagnosisPage.tsx`：

- 401 分支（`setNeedsLogin(...)` 附近）加：`if (cause instanceof ApiError && cause.code === 40100 && file) rememberPendingUpload(file)`。
- 组件顶部用惰性初始化恢复，**不要**在 effect 里 setState：

```ts
const [restored] = useState(() => takePendingUpload())
const [file, setFile] = useState<File | null>(restored)
const [preview, setPreview] = useState<string | null>(() =>
  restored ? URL.createObjectURL(restored) : null,
)
const previewRef = useRef(preview)
const [stage, setStage] = useState<Stage>(restored ? "ready" : "empty")
const [fault, setFault] = useState(() =>
  restored ? infoFault("已为你保留上次选择的影像，继续判读即可") : null,
)
```

- 删除创建 object URL 的那个 effect（现状会在 effect 里 `setPreview`，是 B3 的 lint 债）。改为在 `accept()` 里：先 `if (previewRef.current) URL.revokeObjectURL(previewRef.current)`，再 `const url = URL.createObjectURL(next); previewRef.current = url; setPreview(url)`。
- `reset()` 里同样 revoke 并置空 `previewRef.current` / `setPreview(null)`。
- 加一个只做清理的 effect：`useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current) }, [])`（不 setState）。

- [ ] **Step 5: 验证**

Run: `npm run test && npm run typecheck`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add src/lib/pendingUpload.ts src/lib/pendingUpload.test.ts src/pages/DiagnosisPage.tsx
git commit -m "fix(diagnosis): 未登录上传失败后保留所选影像"
```

---

### Task 7: Agent 发送失败保留输入

**Files:**
- Modify: `src/components/agent/ChatInput.tsx`
- Modify: `src/pages/AgentPage.tsx`
- Test: `src/components/agent/ChatInput.test.tsx`

**Interfaces:**
- `ChatInput` props: `onSend: (text: string, files: File[]) => Promise<boolean>`。
- `AgentPage.handleSend` 返回 `Promise<boolean>`：上传或发送失败返回 `false`，成功返回 `true`。

- [ ] **Step 1: 改测试**

`ChatInput.test.tsx`：`setup()` 里 `const onSend = vi.fn().mockResolvedValue(true)`。追加：

```ts
it("发送失败时保留文字与附件，草稿不清", async () => {
  const onSend = vi.fn().mockResolvedValue(false)
  const onStop = vi.fn()
  render(<ChatInput disabled={false} streaming={false} onSend={onSend} onStop={onStop} />)
  const textarea = screen.getByPlaceholderText(/Enter 发送/) as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: "别丢我" } })
  fireEvent.keyDown(textarea, { key: "Enter" })

  await waitFor(() => expect(onSend).toHaveBeenCalled())
  expect(textarea.value).toBe("别丢我")
  expect(screen.getByRole("button", { name: /发送/ })).toBeTruthy()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/components/agent/ChatInput.test.tsx`
Expected: FAIL，文字被清空。

- [ ] **Step 3: 改 `ChatInput`**

`submit()` 改 `async`：

```ts
const ok = await onSend(trimmed, attachments.map((a) => a.file))
if (!ok) {
  setHint("发送没成功，内容已保留，可以重试")
  textareaRef.current?.focus()
  return
}
attachments.forEach((a) => URL.revokeObjectURL(a.url))
updateText("")
setAttachments([])
setHint("")
clearDraft()
```

`handleKeyDown` 里 `void submit()`。

- [ ] **Step 4: 改 `AgentPage.handleSend`**

在每个失败 `return` 与成功路径返回布尔值：上传 catch `return false`；`send` catch `return false`；成功 `return true`。两处调用点保持 `onSend={async (text, files) => handleSend(text, files)}`。

**同时**：`pushUser` 之前先记住 `const localId = crypto.randomUUID()` 并用它作为消息 id；`send` 失败时把这枚乐观消息撤回：

```ts
setMessages((prev) => prev.filter((message) => message.id !== localId))
```

否则输入框保留了文字，用户重试会在气泡区插入第二条一模一样的用户消息。

- [ ] **Step 5: 补“失败不重复插入”的测试**

在 `src/components/agent/ChatInput.test.tsx` 之外，给 `src/pages/AgentPage.test.tsx` 加一条：mock `send` 失败后发送一次，断言页面上这条用户消息只出现 0 次（已被撤回），且输入框文字仍在。

- [ ] **Step 6: 验证**

Run: `npm run test -- src/components/agent/ChatInput.test.tsx && npm run typecheck`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/components/agent/ChatInput.tsx src/pages/AgentPage.tsx src/components/agent/ChatInput.test.tsx
git commit -m "fix(agent): 发送失败时保留输入与附件"
```

---

### Task 8: 会话隔离与历史竞态

**Files:**
- Create: `src/lib/threadStorage.ts`
- Test: `src/lib/threadStorage.test.ts`
- Modify: `src/pages/AgentPage.tsx`

**Interfaces:**
- Produces: `threadStorageKey(userId?: number | null): string`、`loadThreadId(userId?: number | null): string`、`saveThreadId(userId: number | null | undefined, id: string): void`。

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadThreadId, saveThreadId, threadStorageKey } from "./threadStorage"

describe("threadStorage", () => {
  beforeEach(() => localStorage.clear())

  it("不同用户各存各的", () => {
    saveThreadId(1, "a")
    saveThreadId(2, "b")
    expect(loadThreadId(1)).toBe("a")
    expect(loadThreadId(2)).toBe("b")
  })

  it("匿名态单独一份", () => {
    saveThreadId(null, "anon-thread")
    expect(loadThreadId(null)).toBe("anon-thread")
    expect(loadThreadId(1)).toBe("")
  })

  it("保存空串等于清除", () => {
    saveThreadId(1, "a")
    saveThreadId(1, "")
    expect(loadThreadId(1)).toBe("")
  })

  it("key 带用户 id 前缀", () => {
    expect(threadStorageKey(7)).toBe("agent_current_thread_id:7")
    expect(threadStorageKey(null)).toBe("agent_current_thread_id:anon")
  })

  it("localStorage 抛错时按空值处理，不崩页面", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    expect(loadThreadId(1)).toBe("")
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/lib/threadStorage.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

按 Interfaces 实现。读写都用 `try/catch` 吞掉 `localStorage` 异常（无痕模式下访问会抛）；写空串时 `removeItem`。

- [ ] **Step 4: 接进 `AgentPage`**

- `const { status, user } = useSession()`。
- 删除模块内的 `THREAD_ID_KEY` / `loadThreadId` / `saveThreadId`，改用新模块并把 `user?.id` 传进去。
- 用户变化时清空内存态：在现有的初始化 effect 依赖里加 `user?.id`，进入前 `setThreadId(generateThreadId())`、`setCurrentThreadId("")`，再按新 key 读取。
- `threadIdRef.current = threadId` 改为 `useEffect(() => { threadIdRef.current = threadId }, [threadId])`。
- `loadHistoryMessages` 加序号守卫：

```ts
const historySeq = useRef(0)
async (id: string) => {
  const seq = ++historySeq.current
  setHistoryLoading(true)
  try {
    const data = await getChatHistory(id, undefined, HISTORY_PAGE_SIZE)
    if (seq !== historySeq.current || threadIdRef.current !== id) return
    setMessages((data.messages ?? []).map(mapHistoryMessage))
  } catch (e) {
    if (seq === historySeq.current) pushFault(faultFromError(e, { intent: "load" }))
  } finally {
    if (seq === historySeq.current) setHistoryLoading(false)
  }
}
```

- [ ] **Step 5: 补竞态测试**

在 `src/pages/AgentPage.test.tsx` 追加「切换会话后旧历史不落到新会话」：mock `getSessions` 返回两条会话、`getChatHistory` 用可控 Promise；先触发 A 的加载，再点 B，然后 resolve A 且内容为「A 的旧消息」；断言 `screen.queryByText("A 的旧消息")` 为 `null`。

- [ ] **Step 6: 验证**

Run: `npm run test && npm run typecheck`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add src/lib/threadStorage.ts src/lib/threadStorage.test.ts src/pages/AgentPage.tsx src/pages/AgentPage.test.tsx
git commit -m "fix(agent): 会话按用户隔离并拦截过期历史响应"
```

---

### Task 9: 停止按钮只中止当前流

**Files:**
- Modify: `src/lib/agentStream.ts`
- Test: `src/lib/agentStream.hook.test.tsx`

**Interfaces:**
- `abortRef` 由 `AbortController | null` 改为 `{ token: number; controller: AbortController } | null`。
- `abort()` 语义不变。

- [ ] **Step 1: 写失败测试**

在 `agentStream.hook.test.tsx` 追加：mock `streamChat` 返回可控 Promise 并记录收到的 `signal`。启动 `send` 第一次，再启动第二次；让第一次收尾；断言 `isStreaming` 仍为 `true`，且此时 `abort()` 后再断言第二次的 `signal.aborted === true`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/lib/agentStream.hook.test.tsx`
Expected: FAIL（旧流收尾清掉新流的 controller）。

- [ ] **Step 3: 实现令牌**

- `const streamSeq = useRef(0)`；`send` 里 `const token = ++streamSeq.current`，`abortRef.current = { token, controller }`。
- `finally`：只有 `abortRef.current?.token === token` 时才 `setIsStreaming(false)`、`abortRef.current = null`；`clearLoading()` 同样只在 token 匹配时执行。
- `catch`：`if (streamSeq.current === token) throw e`，否则静默（旧流错误不得覆盖新流）。
- `abort()` / `reset()` / 卸载清理改为 `abortRef.current?.controller.abort()`。

- [ ] **Step 4: 验证**

Run: `npm run test -- src/lib/agentStream.hook.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/agentStream.ts src/lib/agentStream.hook.test.tsx
git commit -m "fix(agent): 旧流收尾不再清掉新流的停止句柄"
```

---

### Task 10: 去掉 `use*` 假 Hook

**Files:**
- Modify: `src/lib/agentUpload.ts`
- Modify: `src/pages/AgentPage.tsx`
- Test: `src/lib/agentUpload.test.ts`（只改 import，如有）

**Interfaces:**
- `useAgentUpload` 更名为 `createAgentUploader`；返回值不变。

- [ ] **Step 1: 改名**

`agentUpload.ts`：`export function createAgentUploader()`。全仓 `grep -rn "useAgentUpload" src/` 应只剩 `AgentPage.tsx`。

- [ ] **Step 2: 改 `AgentPage`**

删除 `useMemo(() => useAgentUpload(), [])` 与 `useMemo` import（若不再使用），改为：

```ts
const [uploader] = useState(createAgentUploader)
```

- [ ] **Step 3: 验证**

Run: `npm run typecheck && npm run test`
Expected: 全绿，`react-hooks/rules-of-hooks` 不再报 `AgentPage.tsx:67`。

- [ ] **Step 4: 提交**

```bash
git add src/lib/agentUpload.ts src/pages/AgentPage.tsx
git commit -m "refactor(agent): 上传器改为工厂函数，去掉 use* 命名误用"
```

---

### Task 11: 对比度令牌

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: 全部 `src/styles/*.css`（仅 `color: var(--signal)` → `color: var(--signal-text)`）
- Test: 新建 `src/styles/tokens.contrast.test.ts`

**Interfaces:**
- 新令牌 `--paper-signal-text: #bd4515`、`--signal-text`。
- 取值：`--paper-ink-3: #676e72`、`--paper-ink-3-dark: #676e72`、`--on-dark-3: #8d948f`。

- [ ] **Step 1: 写失败测试**

`src/styles/tokens.contrast.test.ts`（node 环境）：

```ts
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function lin(c: number) {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8")
const value = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1]

describe("正文三级色对比度", () => {
  it("浅底 paper-ink-3 ≥ 4.5", () => {
    expect(contrast(value("--paper-ink-3"), value("--field"))).toBeGreaterThanOrEqual(4.5)
  })
  it("暗底 on-dark-3 ≥ 4.5（含二级抬升面）", () => {
    expect(contrast(value("--on-dark-3"), value("--dark"))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(value("--on-dark-3"), "#242a27")).toBeGreaterThanOrEqual(4.5)
  })
  it("橙色文字 ≥ 4.5", () => {
    expect(contrast(value("--paper-signal-text"), value("--field"))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(value("--paper-signal-text"), value("--surface"))).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/styles/tokens.contrast.test.ts`
Expected: FAIL（`--paper-signal-text` 不存在；旧值不达标）。

- [ ] **Step 3: 改令牌**

`tokens.css`：

- `--paper-ink-3: #8b9195` → `#676e72`；`--paper-ink-3-dark: #8b9195` → `#676e72`。
- `--on-dark-3: #767d79` → `#8d948f`。
- 新增 `--paper-signal-text: #bd4515;` 与 `--signal-text: var(--paper-signal-text);`（放在 `--signal` 下方）。
- `.is-dark, .is-night, .site-head.is-invert { --signal-text: #ef7a45; }`。
- `html.dark { --signal-text: #ef7a45; }`；`html.dark .is-sheet { --signal-text: var(--paper-signal-text); }`。

- [ ] **Step 4: 替换文字色**

```bash
grep -rl "color: var(--signal)" src/styles | xargs sed -i 's/color: var(--signal)/color: var(--signal-text)/g'
```

替换后 `grep -rn "color: var(--signal)" src/styles` 必须为 0；`border-color`/`background` 里的 `--signal` 不动。

- [ ] **Step 5: 验证**

Run: `npm run test -- src/styles/tokens.contrast.test.ts && npm run build`
Expected: PASS，构建成功。

- [ ] **Step 6: 双主题截图比对**

起 dev server，在浅色/深色下各截判读页、记录页、Agent、管理台首页，确认：三级文字变深但层级仍在；橙色标记仍读作「强调」；记录纸仍是纸白。

- [ ] **Step 7: 提交**

```bash
git add src/styles/tokens.css src/styles/*.css src/styles/tokens.contrast.test.ts
git commit -m "fix(a11y): 正文三级色与橙色文字达到 4.5:1"
```

---

### Task 12: 焦点陷阱与图片预览

**Files:**
- Modify: `src/components/admin/Modal.tsx`
- Modify: `src/pages/AgentPage.tsx`
- Test: 新建 `src/components/admin/Modal.test.tsx`

**Interfaces:**
- `useAdminDialog` 增加 Tab 循环；`Modal` / `Drawer` 行为不变。
- Agent 预览：`role="dialog" aria-modal="true"`，Esc 关闭，关闭按钮，焦点归还。

- [ ] **Step 1: 写失败测试**

`Modal.test.tsx`（jsdom）：渲染 `Modal open`，里面有「取消」「确定」两个按钮；把焦点放到「确定」，`fireEvent.keyDown(document, { key: "Tab" })`；断言 `document.activeElement` 回到面板内第一个可聚焦元素（关闭按钮）。反向 Shift+Tab 从第一个回到最后一个。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -- src/components/admin/Modal.test.tsx`
Expected: FAIL，焦点逃出面板。

- [ ] **Step 3: 实现 Tab 循环**

在 `useAdminDialog` 的 keydown 监听里，`event.key === "Tab"` 且自己是栈顶时：取 `panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')`，在首尾之间 wrap，`event.preventDefault()` 后手工 `focus()`。可聚焦集合为空时不拦截。

- [ ] **Step 4: 改图片预览**

`AgentPage.tsx` 的 `previewUrl && (...)` 块：

- 根节点加 `role="dialog" aria-modal="true" aria-labelledby`（或保留 `aria-label="图片预览"`）。
- 新增 effect：`previewUrl` 变化时，若非空记录 `document.activeElement`、聚焦关闭按钮；清理时归还焦点。Esc 关闭（挂 `keydown`）。
- 加一个右上角关闭按钮（`aria-label="关闭预览"`），样式沿用 `.agent-preview__open` 的定位语言。

- [ ] **Step 5: 验证**

Run: `npm run test -- src/components/admin/Modal.test.tsx && npm run typecheck`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/admin/Modal.tsx src/components/admin/Modal.test.tsx src/pages/AgentPage.tsx
git commit -m "fix(a11y): 弹层加焦点陷阱，图片预览可 Esc 关闭"
```

---

### Task 13: 收回 `outline: none`

**Files:**
- Modify: `src/styles/admin.css`（11 处）、`agent.css`（2 处）、`app.css`（2 处）、`news.css`（1 处）、`records.css`（1 处）

- [ ] **Step 1: 逐处删除**

删除 17 处 `outline: none;`。若某处同时写了自定义 `border-color` 聚焦态，保留自定义，删除 `outline`（全局 `:focus-visible` 会补环）。不要用 `outline: 0` 替代。

- [ ] **Step 2: 验证清零**

Run: `grep -rn "outline: *none\|outline:none" src/styles | wc -l`
Expected: `0`。

- [ ] **Step 3: 键盘走查**

Tab 依次走：登录表单、判读上传槽、记录行、Agent 输入框、弹窗、抽屉、资讯列表。每一项都必须有可见环（1px + 3px offset）。

- [ ] **Step 4: 提交**

```bash
git add src/styles/
git commit -m "fix(a11y): 保留全局可见焦点环，移除模块级 outline:none"
```

---

### Task 14: lint 清零并转硬门

**Files:**
- Delete: `src/components/StarBorder.tsx`、`src/components/GradientASCII.tsx`、`src/components/DotGrid.tsx`
- Modify: `src/components/fault/FaultToaster.tsx`、`src/lib/useInView.ts`、`src/components/theme-provider.tsx`、`src/lib/session.tsx`、`src/lib/agentStream.ts`
- Modify: `.github/workflows/verify.yml`

- [ ] **Step 1: 确认死组件无引用**

Run: `git grep -n "StarBorder\|GradientASCII\|DotGrid" HEAD`
Expected: 只命中这三个文件自身的定义/导出，没有任何 `import`。若有引用，停手并回到 S6 处理。

- [ ] **Step 2: 删除死组件**

三个文件删除后运行 `npm run typecheck && npm run build`，必须全绿。

- [ ] **Step 3: 修剩余 lint**

- `FaultToaster.tsx:87`：`useRef(Date.now())` 改为 `useRef(0)`，在启动计时器的 effect 里 `if (!since.current) since.current = Date.now()`。
- `useInView.ts:16`：`useState(() => typeof IntersectionObserver === "undefined")`，删除 effect 里的同步 `setInView(true)` 分支。
- `theme-provider.tsx:130`：删掉 `resolvedTheme` state 与 `setResolvedTheme`，改为派生 `const resolvedTheme = theme === "system" ? systemTheme : theme`；`systemTheme` 由 `useState(() => getSystemTheme())` + 媒体查询订阅维护；`applyTheme` 只改 DOM class，不再 setState。
- `session.tsx:66`：先尝试把初次探测移进 async IIFE；若规则仍报，加 `// eslint-disable-next-line react-hooks/set-state-in-effect` 并注明「refresh 的首个操作是 await 网络请求，状态更新不在 effect 同步阶段」。
- `agentStream.ts:106`：删掉未使用的 `parsedArgs` 赋值。
- `AgentPage.tsx:111`：若 `loadHistoryMessages` 的同步 `setHistoryLoading(true)` 仍触发，同样用带注释的定点 disable；优先尝试把加载态改为 `historySeq` 驱动的派生值。
- RecordsPage / DiagnosisPage / ChatInput 的同类错误应已被 Task 3 / 6 / 7 消除。

- [ ] **Step 4: 确认清零**

Run: `npm run lint`
Expected: `0 problems`（0 error、0 warning）。

- [ ] **Step 5: lint 转硬门**

`.github/workflows/verify.yml` 删除：

```yaml
        continue-on-error: true
```

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore(web): 清理 lint 债并让 CI 硬拦 lint"
```

---

### Task 15: 冒烟脚本与验收说明

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`
- Create: `e2e/README.md`
- Modify: `README.md`

**Interfaces:**
- `npm run test:e2e` 执行冒烟；默认 `baseURL = http://localhost:5173`。

- [ ] **Step 1: 装 devDependency**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

`package.json` 加 `"test:e2e": "playwright test"`。

- [ ] **Step 2: 写配置**

`playwright.config.ts`：`testDir: "./e2e"`、`use.baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173"`、`fullyParallel: false`、`retries: 0`、单 project chromium。不要配置 webServer（后端要手动起）。

- [ ] **Step 3: 写四条冒烟**

`e2e/smoke.spec.ts`，账号从环境变量取（`E2E_USER` / `E2E_PASSWORD`），缺省时 `test.skip`：

1. 登录 → 进 `/diagnosis`，槽位可见。
2. `/records` 展开第一条，记录纸标题「AI 判读结果」可见。
3. `/news` 点第一条，详情标题可见。
4. `/agent` 输入「你好」发送，30 秒内出现一条 assistant 消息气泡。

- [ ] **Step 4: 写说明**

`e2e/README.md`：前置（后端 :8081 + MySQL + Redis + 算法服务）、环境变量、`npm run test:e2e`、失败时截图位置、为什么不进 CI。

- [ ] **Step 5: 跑一次**

Run: `npm run test:e2e`
Expected: 4 passed（环境齐全时）；缺账号时 4 skipped 且不报错。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json playwright.config.ts e2e README.md
git commit -m "test(web): 添加验收冒烟与运行说明"
```

---

## 批次收尾

每批合入前跑同一套：

```bash
npm run typecheck && npm run test && npm run build
```

B3 起再加 `npm run lint`。B4 发布前加 `npm run test:e2e`。

每批 PR 描述里贴：本批关闭的 spec 条目、验证命令输出、双主题截图（涉及 CSS 时）、未完成项（如「`/stats/my` 待后端」）。
