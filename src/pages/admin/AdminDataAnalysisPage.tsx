import type { ReactElement } from "react"
import { SectionHead } from "@/components/SectionHead"
import { StatTile } from "@/components/admin/StatTile"
import { Toolbar } from "@/components/admin/Toolbar"
import { MiniTrend } from "@/components/admin/charts/MiniTrend"
import { MiniBars } from "@/components/admin/charts/MiniBars"
import { RankedBars } from "@/components/admin/charts/RankedBars"
import { rankDistribution } from "@/lib/adminDomain"

/* ── 示例数据 · SAMPLE ──────────────────────────────────────────────────────
 * 全部数值逐字照搬 Vue 版 DataAnalysisPage.vue（spec §5.6）；病种名按裁定
 * 换成模型八类。本页是静态 mock：时间范围 select 只作范围示意、不真过滤，
 * 各图表也不接端点。数字一律走 .num 等宽，色值一律吃上下文令牌。
 * ──────────────────────────────────────────────────────────────────────── */

const KPIS: {
  label: string
  value: string
  delta?: string
  accent?: boolean
}[] = [
  { label: "总诊断数", value: "8,452", delta: "↑12.5%", accent: true },
  { label: "给出结论数", value: "7,891", delta: "↑8.2%" },
  // 不写准确率。本产品没有验证队列、没有参考标准，报不出一个能站住的准确率；
  // 而且这一页连统计接口都没接，报出来的数字只是示例。医疗 AI 产品的准确率
  // 是要被追责的读数，不能用示例数据占位。
  { label: "准确率", value: "未评测", delta: "尚无验证集" },
  // StatTile 的 delta 是纯展示字符串，把「较上月优化」并进同一行（无独立 trendLabel 契约）。
  { label: "平均诊断速度", value: "2.3s", delta: "↓15.4% · 较上月优化" },
]

/** 12 月 6 病种小倍数折线：逐字照搬 Vue 数值，按裁定换名（不自行合并系列）。 */
const MONTHLY_TRENDS: { title: string; points: number[] }[] = [
  {
    title: "糖尿病视网膜病变",
    points: [820, 932, 901, 934, 1290, 1330, 1320, 1020, 930, 820, 980, 1000],
  },
  {
    title: "白内障",
    points: [120, 132, 101, 134, 90, 230, 210, 182, 191, 234, 290, 330],
  },
  {
    title: "青光眼",
    points: [820, 932, 901, 934, 1290, 1330, 1320, 1020, 930, 820, 980, 1000],
  },
  {
    title: "AMD",
    points: [150, 232, 201, 154, 190, 330, 410, 320, 310, 123, 440, 320],
  },
  {
    title: "病理性近视",
    points: [220, 182, 191, 234, 290, 330, 310, 123, 442, 321, 90, 149],
  },
  {
    title: "正常",
    points: [320, 332, 301, 334, 390, 330, 320, 310, 123, 442, 321, 90],
  },
]

/** 疾病分布 10 类：逐字照搬 Vue 数值、换为模型病种名，交给 rankDistribution 排序。 */
const DISTRIBUTION = [
  { name: "糖尿病视网膜病变", value: 1048 },
  { name: "白内障", value: 735 },
  { name: "青光眼", value: 580 },
  { name: "AMD", value: 484 },
  { name: "病理性近视", value: 300 },
  { name: "正常", value: 251 },
  { name: "高血压性视网膜病变", value: 198 },
  { name: "其他", value: 102 },
  { name: "角膜炎", value: 98 },
  { name: "结膜炎", value: 70 },
]

const RANKED_ROWS = rankDistribution(DISTRIBUTION)

/** 按周活跃 3 系列小倍数柱图：周一 ~ 周日，逐字照搬 Vue 数值。 */
const WEEK_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

const WEEKLY_ACTIVE: { title: string; values: number[] }[] = [
  { title: "在线诊断", values: [120, 200, 150, 80, 70, 110, 130] },
  { title: "报告查看", values: [90, 150, 180, 220, 200, 180, 160] },
  { title: "数据导出", values: [30, 50, 40, 60, 45, 35, 25] },
]

const WEEKLY_BARS = WEEKLY_ACTIVE.map((series) => ({
  title: series.title,
  bars: series.values.map((value, i) => ({ label: WEEK_LABELS[i], value })),
}))

/**
 * 数据分析（mock 页）。与仪表盘同版式：页首章节头 + 右上 mono 示例小标 →
 * 4 列 KPI 条 → 工具条（时间范围，装饰性）→ 12 月 6 病种小倍数折线（3×2）
 * → 疾病分布 10 类排序横条 → 按周活跃 3 系列小倍数柱图（3 列）。
 * 分段一律 1px 发丝线，无重卡片阴影；组件自身已带边框，这里只管栅格与间距。
 */
export function AdminDataAnalysisPage(): ReactElement {
  return (
    <div className="admin-analysis">
      <div className="admin-analysis__head">
        <SectionHead code="06" kicker="数据分析" en="ADMIN · DATA ANALYSIS" />
        <span className="admin-sample num">示例数据 · SAMPLE</span>
      </div>

      <p className="admin-sample-note">
        本页全部为示例数据，尚未接入后端统计接口。所列数字不代表实际业务量，不可用于汇报或对外引用。
      </p>

      <section className="admin-kpis" aria-label="关键指标">
        {KPIS.map((kpi) => (
          <StatTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            accent={kpi.accent}
          />
        ))}
      </section>

      <Toolbar>
        <label className="admin-analysis__field">
          <span className="admin-analysis__label">时间范围 · RANGE</span>
          {/* 装饰性范围示意：本页为静态 mock，切换不触发任何过滤或请求。 */}
          <select
            className="admin-analysis__select"
            defaultValue="30"
            aria-label="时间范围（示意，不真过滤）"
          >
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
            <option value="90">近 90 天</option>
          </select>
        </label>
      </Toolbar>

      <section className="admin-analysis__section" aria-label="12 月病种趋势">
        <h2 className="admin-analysis__title">12 月病种趋势</h2>
        <div className="admin-analysis__grid admin-analysis__grid--trend">
          {MONTHLY_TRENDS.map((series) => (
            <MiniTrend key={series.title} title={series.title} points={series.points} />
          ))}
        </div>
      </section>

      <section className="admin-analysis__section" aria-label="疾病分布">
        <h2 className="admin-analysis__title">疾病分布</h2>
        <RankedBars rows={RANKED_ROWS} ariaLabel="疾病分布 · 10 类" />
      </section>

      <section className="admin-analysis__section" aria-label="按周活跃">
        <h2 className="admin-analysis__title">按周活跃</h2>
        <div className="admin-analysis__grid admin-analysis__grid--weekly">
          {WEEKLY_BARS.map((series) => (
            <MiniBars key={series.title} title={series.title} bars={series.bars} />
          ))}
        </div>
      </section>
    </div>
  )
}

export default AdminDataAnalysisPage
