// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  canRequestReexamine,
  loadMyStats,
  reexamineLabel,
  reexamineView,
  statsLabels,
  summarizeRecords,
} from "./records"
import { ApiError, getMyStats } from "./api"
import type { DiagnosisManage } from "./api"

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>()
  return { ...actual, getMyStats: vi.fn() }
})

function row(overrides: Partial<DiagnosisManage> = {}): DiagnosisManage {
  return {
    id: "1",
    result: "正常",
    severity: "normal",
    reexamineStatus: 1,
    createTime: "2026-11-01 10:00:00",
    ...overrides,
  }
}

describe("reexamineLabel", () => {
  it("三种复审状态各有文案", () => {
    expect(reexamineLabel(1)).toBe("未复审")
    expect(reexamineLabel(2)).toBe("复审中")
    expect(reexamineLabel(3)).toBe("已复审")
  })

  it("缺省按未复审处理", () => {
    expect(reexamineLabel(undefined)).toBe("未复审")
  })
})

describe("summarizeRecords", () => {
  it("total 取信封值而不是数 records", () => {
    const stats = summarizeRecords([row(), row()], 37)
    expect(stats.total).toBe(37)
  })

  it("高风险只数未拒识且 severity=severe 的记录", () => {
    const stats = summarizeRecords(
      [
        row({ severity: "severe" }),
        row({ severity: "severe", aiRejected: true }),
        row({ severity: "moderate" }),
        row({ aiRejected: true }),
      ],
      4,
    )
    expect(stats.highRisk).toBe(1)
  })

  it("待复核数 requiresReview 为真的记录", () => {
    const stats = summarizeRecords([row({ requiresReview: true }), row()], 2)
    expect(stats.awaitingReview).toBe(1)
  })

  it("最近判读时间取 createTime 的最大值", () => {
    const stats = summarizeRecords(
      [row({ createTime: "2026-11-01 10:00:00" }), row({ createTime: "2026-11-08 09:30:00" })],
      2,
    )
    expect(stats.lastReadAt).toBe("2026-11-08 09:30:00")
  })

  it("空列表：总数照传、时间与计数归零", () => {
    const stats = summarizeRecords([], 0)
    expect(stats).toEqual({ total: 0, highRisk: 0, awaitingReview: 0, lastReadAt: null })
  })
})

describe("canRequestReexamine", () => {
  it("未复审与已复审都可申请", () => {
    expect(canRequestReexamine(row({ reexamineStatus: 1 }))).toBe(true)
    expect(canRequestReexamine(row({ reexamineStatus: 3 }))).toBe(true)
  })

  it("复审中不可重复申请", () => {
    expect(canRequestReexamine(row({ reexamineStatus: 2 }))).toBe(false)
  })

  it("拒识记录没有可复核的结论，不给申请", () => {
    expect(canRequestReexamine(row({ aiRejected: true }))).toBe(false)
  })
})

const mockedStats = vi.mocked(getMyStats)

beforeEach(() => {
  mockedStats.mockReset()
})

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

  it("服务端返回空对象时降级到本页口径（不冒充全量）", async () => {
    mockedStats.mockResolvedValueOnce({} as never)
    const result = await loadMyStats([row({ severity: "severe" })], 37)
    expect(result.scope).toBe("page")
    expect(result.stats.highRisk).toBe(1)
  })

  it("服务端返回 null 时降级到本页口径", async () => {
    mockedStats.mockResolvedValueOnce(null as never)
    const result = await loadMyStats([], 0)
    expect(result.scope).toBe("page")
    expect(result.stats.total).toBe(0)
  })

  it("字段缺一（缺 highRisk）时降级到本页口径", async () => {
    mockedStats.mockResolvedValueOnce({
      total: 128,
      awaitingReview: 12,
      lastReadAt: null,
    } as never)
    const result = await loadMyStats([], 0)
    expect(result.scope).toBe("page")
  })

  it("数值字段不是有限数字时降级到本页口径", async () => {
    mockedStats.mockResolvedValueOnce({
      total: "128",
      highRisk: 9,
      awaitingReview: 12,
      lastReadAt: null,
    } as never)
    const result = await loadMyStats([], 0)
    expect(result.scope).toBe("page")
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
