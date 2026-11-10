/**
 * 判读记录的统计与展示聚合。
 *
 * KPI 从首页一次大页拉取在本地汇总——个人判读量是百级、千级的数据，
 * 前端算比后端再加聚合接口划算，且不用动后端契约。
 */

import { getMyStats } from "./api"
import type { DiagnosisManage } from "./api"

export type RecordStats = {
  /** 名下判读总数（分页信封的 total，不依赖拉满首页）。 */
  total: number
  /** 高风险（severity=severe）条数。拒识记录没有严重度，不计入。 */
  highRisk: number
  /** 待人工复核条数。 */
  awaitingReview: number
  /** 最近一次判读时间，没有记录时为 null。 */
  lastReadAt: string | null
}

/** reexamineStatus → 展示文案。1 未复审 / 2 复审中 / 3 已复审。 */
export function reexamineLabel(status?: number): string {
  switch (status) {
    case 2:
      return "复审中"
    case 3:
      return "已复审"
    default:
      return "未复审"
  }
}

/** 从一页记录里累加统计。total 用传入的 total（信封值），不数 records。 */
export function summarizeRecords(
  records: DiagnosisManage[],
  total: number,
): RecordStats {
  const highRisk = records.filter(
    (item) => !item.aiRejected && item.severity === "severe",
  ).length
  const awaitingReview = records.filter((item) => item.requiresReview).length
  const lastReadAt = records.reduce<string | null>((acc, item) => {
    if (!item.createTime) return acc
    return !acc || item.createTime > acc ? item.createTime : acc
  }, null)

  return { total, highRisk, awaitingReview, lastReadAt }
}

/** 统计口径：all = 服务端全量聚合；page = 当前页本地汇总。 */
export type StatsScope = "all" | "page"

export type ScopedStats = {
  stats: RecordStats
  scope: StatsScope
}

/**
 * 服务端聚合优先。任何失败（404 未实现、5xx、网络）都降级到当前页，
 * 并把口径标成 page——页面据此写明「本页」，不会把一页的数字冒充全量。
 *
 * 200 但载荷不对（空对象、null、缺字段、类型不对）同样降级：
 * 空 KPI 配「高风险」这种全量标签，比报错更糟。
 */
export async function loadMyStats(
  records: DiagnosisManage[],
  total: number,
): Promise<ScopedStats> {
  const fallback = (): ScopedStats => ({
    stats: summarizeRecords(records, total),
    scope: "page",
  })
  try {
    const stats = await getMyStats()
    if (!isStatsPayload(stats)) return fallback()
    return { stats, scope: "all" }
  } catch {
    return fallback()
  }
}

/** 聚合载荷的形状校验：四个字段齐全且类型正确。 */
function isStatsPayload(value: unknown): value is RecordStats {
  if (!value || typeof value !== "object") return false
  const payload = value as Record<string, unknown>
  const isCount = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0
  return (
    isCount(payload.total) &&
    isCount(payload.highRisk) &&
    isCount(payload.awaitingReview) &&
    (payload.lastReadAt === null || typeof payload.lastReadAt === "string")
  )
}

export function statsLabels(scope: StatsScope): {
  total: string
  highRisk: string
  awaitingReview: string
  lastReadAt: string
} {
  if (scope === "all") {
    return {
      total: "判读总数 · TOTAL",
      highRisk: "高风险 · SEVERE",
      awaitingReview: "待人工复核 · REVIEW",
      lastReadAt: "最近判读 · LAST",
    }
  }
  return {
    total: "判读总数 · TOTAL",
    highRisk: "本页高风险 · SEVERE",
    awaitingReview: "本页待人工复核 · REVIEW",
    lastReadAt: "本页最近 · LAST",
  }
}

export type ReexamineView = "receipt" | "request" | "reviewed" | null

/**
 * 复诊区块的三态。只要记录非拒识且有复审状态就渲染——
 * 重新打开一条「复审中」的记录也必须看到回执，不能整块消失。
 */
export function reexamineView(item: DiagnosisManage, reexamined: boolean): ReexamineView {
  if (item.aiRejected || item.reexamineStatus == null) return null
  if (reexamined || item.reexamineStatus === 2) return "receipt"
  return item.reexamineStatus === 3 ? "reviewed" : "request"
}

/** 「已复审 / 复审完成」的记录允许再申请复诊——复审中的不重复提交。 */
export function canRequestReexamine(item: DiagnosisManage): boolean {
  if (item.aiRejected) return false
  return item.reexamineStatus === 1 || item.reexamineStatus === 3
}
