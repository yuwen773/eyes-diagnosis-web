/**
 * 管理后台纯函数层。只做「展示映射」与「动作守卫」两类判定，不发请求、不碰 DOM，
 * 便于表格/图表多处复用，也便于把 Vue 版踩过的坑固化成回归用例。
 */

import type { Risk } from "@/lib/domain"
import type { AdminDiagnosis, AdminUser } from "@/lib/adminApi"

/** 复审状态 → 标签与风险档。优先级：aiRejected > requiresReview > reexamineStatus。 */
export function reviewView(
  rec: Pick<AdminDiagnosis, "reexamineStatus" | "requiresReview" | "aiRejected">,
): { label: string; risk: Risk; tone: "ai" | "review" | "plain" } {
  // AI 拒识是最强信号：模型根本没下结论，必须压过任何人工复核状态。
  // 否则一条废记录若恰为「已复审」会被显示成已确认，误导医生。
  if (rec.aiRejected === true) {
    return { label: "AI 拒识", risk: "critical", tone: "ai" }
  }
  // 「待人工复核」是待办动作，优先于只记录流程进度的 reexamineStatus，
  // 让管理员先看到「该做什么」而不是「走到哪一步」。
  if (rec.requiresReview === true) {
    return { label: "待人工复核", risk: "attention", tone: "review" }
  }
  switch (rec.reexamineStatus) {
    case 2:
      return { label: "复审中", risk: "attention", tone: "plain" }
    case 3:
      return { label: "已复审", risk: "normal", tone: "plain" }
    case 1:
    case 0:
    default:
      // 状态 1 / 0 / 缺省都归「未复审」：后端没写入状态时不能显示成已复审。
      return { label: "未复审", risk: "attention", tone: "plain" }
  }
}

/**
 * 新闻发布状态 → 标签与风险档。后端 t_news.status 语义：0 草稿 / 1 已发布 / 2 下架。
 *
 * 缺省（字段缺席或非法值）一律读成「未知」而不是「草稿」：老数据里没写状态的
 * 新闻不能凭空显示成草稿，让管理员以为它还没发出去。
 */
export function newsStatusView(status?: number | null): {
  label: string
  risk: Risk
} {
  switch (status) {
    case 0:
      return { label: "草稿", risk: "attention" }
    case 1:
      return { label: "已发布", risk: "normal" }
    case 2:
      return { label: "已下架", risk: "critical" }
    default:
      return { label: "未知", risk: "unknown" }
  }
}

/** 新闻发布状态的可选项（编辑页下拉与列表标签同源，避免两处各写一套文案）。 */
export const NEWS_STATUS_OPTIONS = [
  { value: 0, label: "草稿" },
  { value: 1, label: "已发布" },
  { value: 2, label: "已下架" },
] as const

/** 用户删除守卫：目标是 admin 不给删（修正 Vue 版写反的守卫）。 */export function canDeleteUser(target?: AdminUser | null): boolean {
  // 目标缺失直接不给删：空白行或未选中就点删除，不该发出带空 id 的请求。
  // 只拦 admin；普通用户与角色字段缺失的旧数据放行，避免误伤可删记录。
  return target != null && target.userRole !== "admin"
}

/** 新闻正文长度守卫：后端 content.substring(0,30) 对 <30 字抛异常。 */
export function newsContentValid(content: string): boolean {
  // 按「有效正文」量长度而非原始长度：29 字正文补两个空格凑到 31 字，
  // 仍不该放行——摘要只取正文，空白不算内容。
  // 注意：brief 内联规则写的是 content.length >= 30（不 trim），但逐字落地的
  // 「29 字加空白仍拦」用例原始长度为 31，该规则会返回 true 与用例冲突；
  // 为保证逐字落地的测试通过，这里以 trim 后的长度判定（详见 task-2-report.md）。
  return content.trim().length >= 30
}

export type Ranked = { name: string; value: number; share: number }

/** 分布排序：value 降序，share = value/total（total 0 时 share 全 0）。 */
export function rankDistribution(rows: { name: string; value: number }[]): Ranked[] {
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  // 复制后再排序：纯函数不该改动调用方传入的数组顺序。
  return [...rows]
    .sort((a, b) => b.value - a.value)
    .map((row) => ({
      name: row.name,
      value: row.value,
      // total 为 0 时 value/total 会得到 NaN，图表读到 NaN 会画不出来，统一给 0。
      share: total === 0 ? 0 : row.value / total,
    }))
}

/** 横条内标签放得下吗：估计宽 = 名称字符数 × 12px + 16px 内边距，超过条宽则放不下。 */
export function barLabelFits(barWidthPx: number, label: string): boolean {
  // 中文等宽近似 + 左右各 8px 内边距；宽度不够就让标签移到条外，避免文字被裁。
  return label.length * 12 + 16 <= barWidthPx
}

/**
 * 置信度 → 百分比读数（一位小数，带 %）。
 *
 * 实现放在 domain.ts，患者端与后台共用同一份口径：后端置信度可能是 0–1 概率，
 * 也可能是 0–100 百分数，先经 normalizeConfidence 归一再 ×100，两种量纲都读得对。
 *
 * 「没有结论」与「结论是零」是两回事：undefined / null / NaN 一律显示「—」。
 * AI 拒识的记录后端把置信度置空（null），若照 normalizeConfidence 收成 0 再显示，
 * 页面会把一条拒识记录读成「0.0% 的诊断」——那是在说一条不存在的结论。
 */
export { confidencePercent } from "@/lib/domain"
