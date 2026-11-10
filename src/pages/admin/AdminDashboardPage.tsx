import type { ReactElement } from "react"
import { SectionHead } from "@/components/SectionHead"
import { StatTile } from "@/components/admin/StatTile"
import { TrendChart } from "@/components/admin/charts/TrendChart"
import { RankedBars } from "@/components/admin/charts/RankedBars"
import { DataTable } from "@/components/admin/DataTable"
import type { Column } from "@/components/admin/DataTable"
import { rankDistribution } from "@/lib/adminDomain"

/* ── mock 数据：逐字照搬 spec §5.6 / Vue 版，病种换成模型八类 ────────── */
const KPIS: {
  label: string
  value: string
  delta?: string
  accent?: boolean
}[] = [
  // 与「数据分析」页的同一指标同一个数：两个页面各写一个数，管理员会以为
  // 其中一个是错的。同为示例数据，至少别自相矛盾。
  { label: "总诊断数", value: "8,452", delta: "↑12.5%", accent: true },
  { label: "用户总数", value: "1,284" },
  { label: "今日新增", value: "47" },
  { label: "知识库文件", value: "126" },
]

/** 近 7 天诊断次数：周一 ~ 周日。 */
const TREND_POINTS = [
  { label: "周一", value: 62 },
  { label: "周二", value: 78 },
  { label: "周三", value: 53 },
  { label: "周四", value: 91 },
  { label: "周五", value: 84 },
  { label: "周六", value: 47 },
  { label: "周日", value: 65 },
]

const DISTRIBUTION = [
  { name: "正常", value: 1048 },
  { name: "白内障", value: 735 },
  { name: "青光眼", value: 580 },
  { name: "糖尿病视网膜病变", value: 484 },
  { name: "AMD", value: 300 },
  { name: "其他", value: 200 },
]

type RecentRow = {
  id: string
  user: string
  result: string
  confidence: number
  time: string
}

const RECENT_ROWS: RecentRow[] = [
  { id: "1", user: "张三", result: "正常", confidence: 0.95, time: "2026-04-23 14:32" },
  { id: "2", user: "李四", result: "白内障", confidence: 0.87, time: "2026-04-23 13:18" },
  { id: "3", user: "王五", result: "正常", confidence: 0.99, time: "2026-04-23 11:45" },
  { id: "4", user: "赵六", result: "青光眼", confidence: 0.76, time: "2026-04-23 10:20" },
  { id: "5", user: "孙七", result: "糖尿病视网膜病变", confidence: 0.82, time: "2026-04-23 09:05" },
]

const RECENT_COLUMNS: Column<RecentRow>[] = [
  { key: "user", title: "用户" },
  { key: "result", title: "结果" },
  {
    key: "confidence",
    title: "置信度",
    mono: true,
    render: (row) => (
      <span className="num">{(row.confidence * 100).toFixed(1)}%</span>
    ),
  },
  { key: "time", title: "时间", mono: true },
]

/** 诊断分布读数：value 降序 + share 占比，RankedBars 直接消费。 */
const RANKED_ROWS = rankDistribution(DISTRIBUTION)

/**
 * 仪表盘（mock 页）。「白色仪器」：章节头发丝线、KPI 条、图 / 表卡、
 * 最近记录表，各段用发丝线分隔，不做重卡片阴影。全部数值为示例数据，
 * 右上角常驻 mono 小标「示例数据 · SAMPLE」。
 */
export function AdminDashboardPage(): ReactElement {
  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__head">
        <SectionHead code="01" kicker="仪表盘" en="ADMIN · DASHBOARD" />
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

      <section className="admin-dashboard__charts" aria-label="趋势与分布">
        <TrendChart points={TREND_POINTS} ariaLabel="诊断趋势 · 近 7 天" />
        <RankedBars rows={RANKED_ROWS} ariaLabel="疾病分布 · 6 类" />
      </section>

      <section className="admin-dashboard__records" aria-label="最近诊断记录">
        <h2 className="admin-dashboard__records-title">最近诊断记录</h2>
        <DataTable<RecentRow>
          columns={RECENT_COLUMNS}
          rows={RECENT_ROWS}
          rowKey={(row) => row.id}
          page={{ current: 1, pageSize: 10, total: 5 }}
          // mock 页固定单页，无翻页 / 每页条数交互，故空实现。
          onPageChange={() => {}}
        />
      </section>
    </div>
  )
}

export default AdminDashboardPage
