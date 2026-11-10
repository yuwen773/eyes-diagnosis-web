import type { DiagnosisResult } from "@/lib/api"

export type Risk = "normal" | "attention" | "critical" | "unknown"

/** 模型覆盖的八类眼底改变。code 为记录纸上使用的短码。 */
export const CLASSES = [
  { code: "N", name: "正常", desc: "未见明显异常，血管走行与视盘边界正常。" },
  { code: "AMD", name: "年龄相关性黄斑变性", desc: "黄斑区玻璃膜疣、色素改变或新生血管。" },
  { code: "CAT", name: "白内障", desc: "晶状体混浊，影像对比度下降。" },
  { code: "DR", name: "糖尿病视网膜病变", desc: "微血管瘤、出血、硬性渗出与棉絮斑。" },
  { code: "GLA", name: "青光眼", desc: "视杯扩大、神经纤维层缺损。" },
  { code: "HR", name: "高血压性视网膜病变", desc: "动脉变细、动静脉交叉压迹。" },
  { code: "PM", name: "病理性近视", desc: "豹纹状眼底、后巩膜葡萄肿、漆裂纹。" },
  { code: "OTH", name: "其他", desc: "存在异常但无法归入以上七类。" },
] as const

const CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  CLASSES.map((item) => [item.name, item.code]),
)

export function classCode(name?: string) {
  if (!name) return "—"
  const exact = CODE_BY_NAME[name]
  if (exact) return exact
  const hit = CLASSES.find((item) => name.includes(item.name) || item.name.includes(name))
  return hit?.code ?? "—"
}

const SEVERITY_LABEL: Record<string, string> = {
  normal: "正常",
  mild: "轻度",
  moderate: "中度",
  severe: "严重",
  NOT_ASSESSED: "未评估",
}

export function severityLabel(severity?: string) {
  if (!severity) return "未评估"
  return SEVERITY_LABEL[severity] ?? severity
}

export function severityRisk(severity?: string): Risk {
  switch (severity) {
    case "normal":
      return "normal"
    case "mild":
    case "moderate":
      return "attention"
    case "severe":
      return "critical"
    default:
      return "unknown"
  }
}

/** 复核状态 → 展示文案与风险色。 */
export function reviewState(status?: string): { label: string; risk: Risk } {
  switch (status) {
    case "APPROVED":
      return { label: "已签字", risk: "normal" }
    case "REJECTED":
      return { label: "已退回", risk: "critical" }
    case "PENDING":
      return { label: "待复核", risk: "attention" }
    case "PENDING_AI":
    default:
      return { label: "待复核", risk: "attention" }
  }
}

/**
 * 置信度分档。
 *
 * 三档，不把 0.4 与 0.6 折叠成同一个标签：患者看到「低置信」时无从判断该多担心，
 * 两档折叠等于把风险信息直接丢掉。阈值沿用 0.75 / 0.60（低于 0.6 不宜单独下结论）。
 */
export type ConfidenceBand = {
  /** 档位标签，直接给患者看。 */
  label: string
  risk: Risk
}

/** 置信度 → 分档。缺省或非数值读作「未评估」，不猜。 */
export function confidenceBand(confidence?: number | null): ConfidenceBand {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    return { label: "未评估", risk: "unknown" }
  }
  const value = normalizeConfidence(confidence)
  if (value >= 0.75) return { label: "可信", risk: "normal" }
  if (value >= 0.6) return { label: "偏低", risk: "attention" }
  return { label: "低", risk: "critical" }
}

/**
 * 置信度 → 百分比读数（一位小数，带 %）。
 *
 * 全站唯一口径：后端给 0–1 概率或 0–100 百分数都先归一到 0–1 再乘 100。
 * 患者端与后台读同一个数，不再一个显示 0.78 一个显示 78.0%。
 *
 * 「没有结论」与「结论是零」是两回事：undefined / null / NaN 一律显示「—」。
 */
export function confidencePercent(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—"
  return `${(normalizeConfidence(value) * 100).toFixed(1)}%`
}

/** 把可能是百分数（0–100）或概率（0–1）的置信度归一为 0–1。 */
export function normalizeConfidence(confidence?: number | null): number {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return 0
  return confidence > 1 ? Math.min(confidence / 100, 1) : Math.max(confidence, 0)
}

export type RankedClass = {
  code: string
  name: string
  probability: number
  top: boolean
  benign: boolean
}

/** 主诊断 + 其他诊断合成按概率排序的八类分布。 */
export function rankClasses(result?: DiagnosisResult): RankedClass[] {
  if (!result) return []

  const rows: { name: string; probability: number }[] = []
  if (result.result) {
    rows.push({
      name: result.result,
      probability:
        typeof result.probability === "number"
          ? normalizeConfidence(result.probability)
          : normalizeConfidence(result.confidence),
    })
  }
  for (const item of result.otherDisease ?? []) {
    if (!item?.name) continue
    rows.push({
      name: item.name,
      probability: normalizeConfidence(item.probability),
    })
  }

  rows.sort((a, b) => b.probability - a.probability)
  const highest = rows[0]?.probability ?? 0

  return rows.map((row) => ({
    code: classCode(row.name),
    name: row.name,
    probability: row.probability,
    top: row.probability === highest,
    benign: row.name.includes("正常"),
  }))
}

export function recommendationLines(result?: DiagnosisResult): string[] {
  const raw = result?.recommendations
  if (!raw) return []
  return raw
    .split(/\r?\n|；/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/**
 * 急症措辞。
 *
 * 只认「骤变 + 特异表现 + 立即处置」这一类。像「视力下降」「注意休息」这种泛化描述
 * 出现在绝大多数建议里，一旦也算急症，红色标记就变成背景噪声——标记一旦泛滥，
 * 等于没有标记。
 */
const URGENT_ADVICE =
  /(视力骤降|骤降|突发性?视力|突然.{0,4}看不清|飞蚊骤增|闪光感|视野缺损|视野突然变窄|黑影遮挡|剧烈眼痛|眼球突出|复视|立即就医|尽快就医|前往急诊|急诊科)/

/** 这条建议是不是急症。 */
export function isUrgentAdvice(line: string): boolean {
  return URGENT_ADVICE.test(line)
}

/**
 * 模型没给出建议时的兜底。
 *
 * 活路径必须自带急症分流：硬编码的示例数据里有「飞蚊骤增请立即就诊」，
 * 真实判读却没有，患者在空建议页上看不到任何「什么时候必须马上就医」。
 */
export const TRIAGE_FALLBACK =
  "本次判读未给出个体化建议。如出现视力骤降、飞蚊骤增、闪光感或视野缺损，请立即前往眼科急诊，不要等待判读结果。"

export function formatTimestamp(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** 权重指纹在记录纸上只留首尾，保持可核对又不喧宾夺主。 */
export function shortHash(hash?: string) {
  if (!hash) return "—"
  if (hash.length <= 14) return hash
  return `${hash.slice(0, 6)}…${hash.slice(-6)}`
}
