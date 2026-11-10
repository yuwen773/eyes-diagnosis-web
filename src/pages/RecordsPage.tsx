import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  describeError,
  getMyDiagnosis,
  listMyDiagnoses,
  requestReexamine,
  type DiagnosisManage,
  type ErrorDetail,
  type RecordPage,
  type DiagnosisResult,
} from "@/lib/api"
import {
  loadMyStats,
  reexamineLabel,
  reexamineView,
  statsLabels,
  summarizeRecords,
  type ScopedStats,
} from "@/lib/records"
import {
  classCode,
  confidencePercent,
  formatTimestamp,
  severityLabel,
  severityRisk,
} from "@/lib/domain"
import { faultFromError } from "@/lib/faults"
import { useFault } from "@/components/fault"
import { RecordSheet } from "@/components/RecordSheet"
import { RiskTag } from "@/components/RiskTag"
import { EmptyFrame } from "@/components/EmptyFrame"
import { FaultPanel } from "@/components/FaultPanel"
import { SectionHead } from "@/components/SectionHead"
import { DisclaimerBar } from "@/components/DisclaimerBar"
import { SiteHeader } from "@/components/SiteHeader"

const PAGE_SIZE = 10

type ListState = {
  key: string
  data: RecordPage<DiagnosisManage> | null
  fault: ErrorDetail | null
}

type DetailState = {
  id: string
  result: DiagnosisResult | null
  fault: ErrorDetail | null
  /** 复诊申请提交成功后置 true，行内状态翻成「复审中」。 */
  reexamined: boolean
  submitting: boolean
}

export function RecordsPage() {
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const { push } = useFault()

  const requestKey = `${page}|${reload}`
  const [list, setList] = useState<ListState>({ key: "", data: null, fault: null })

  useEffect(() => {
    let alive = true

    listMyDiagnoses({ current: page, pageSize: PAGE_SIZE }).then(
      (value) => {
        if (alive) setList({ key: requestKey, data: value, fault: null })
      },
      (cause) => {
        if (!alive) return
        setList({ key: requestKey, data: null, fault: describeError(cause) })
      },
    )

    return () => {
      alive = false
    }
  }, [requestKey, page])

  const loading = list.key !== requestKey
  const fault = list.key === requestKey ? list.fault : null
  const data = list.key === requestKey ? list.data : null
  const records = useMemo(() => data?.records ?? [], [data])

  const [scoped, setScoped] = useState<ScopedStats | null>(null)

  // 服务端聚合优先；接口未上线或失败时 loadMyStats 自己降级到本页。
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

  /** 展开的记录详情。同一时刻只开一条。 */
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [detailKey, setDetailKey] = useState(0)

  useEffect(() => {
    if (!openId) return
    let alive = true

    getMyDiagnosis(openId).then(
      (value) => {
        if (alive) setDetail((prev) => (prev?.id === openId ? { ...prev, result: value } : prev))
      },
      (cause) => {
        if (!alive) return
        setDetail((prev) =>
          prev?.id === openId ? { ...prev, fault: describeError(cause) } : prev,
        )
      },
    )

    return () => {
      alive = false
    }
  }, [openId, detailKey])

  async function submitReexamine(id: string) {
    setDetail((prev) => (prev?.id === id ? { ...prev, submitting: true } : prev))
    try {
      await requestReexamine(id)
      setDetail((prev) =>
        prev?.id === id ? { ...prev, reexamined: true, submitting: false } : prev,
      )
      // 行内状态也要跟着翻：本地翻转，不再发一次列表请求。
      setList((prev) => {
        if (!prev.data) return prev
        return {
          ...prev,
          data: {
            ...prev.data,
            records: prev.data.records?.map((item) =>
              item.id === id ? { ...item, reexamineStatus: 2 } : item,
            ),
          },
        }
      })
    } catch (cause) {
      setDetail((prev) => (prev?.id === id ? { ...prev, submitting: false } : prev))
      push(faultFromError(cause, { intent: "generic", action: { label: "重试", run: () => void submitReexamine(id) } }))
    }
  }

  function closeDetail() {
    setOpenId(null)
    setDetail(null)
  }

  function openDetail(id: string) {
    setOpenId(id)
    setDetail({ id, result: null, fault: null, reexamined: false, submitting: false })
  }

  function toggle(id: string) {
    if (openId === id) closeDetail()
    else openDetail(id)
  }

  function retryDetail() {
    setDetail((prev) => (prev ? { ...prev, result: null, fault: null } : prev))
    setDetailKey((value) => value + 1)
  }

  function retry() {
    closeDetail()
    setScoped(null)
    setReload((value) => value + 1)
  }

  function goPage(next: number) {
    closeDetail()
    setScoped(null)
    setPage(next)
  }

  const pages = Math.max(1, data?.pages ?? 1)

  return (
    <div className="is-field">
      <SiteHeader />

      <main className="wrap records">
        <SectionHead code="04" kicker="诊断记录" en="RECORDS · MY READINGS" />

        <div className="records__intro">
          <p className="overline">Ledger · 判读台账</p>
          <h1 className="display records__title">诊断记录</h1>
          <p className="lead">
            你名下所有的判读，每一条都保留模型版本与权重指纹。点开一条，展开就是那张记录纸。
          </p>
        </div>

        <div className="strip records__strip">
          <div className="strip__cell">
            <div className="readout">
              <span className="readout__label">{labels.total}</span>
              <span className="readout__value num">{stats.total}</span>
            </div>
          </div>
          <div className="strip__cell">
            <div className="readout">
              <span className="readout__label">{labels.highRisk}</span>
              <span className="readout__value num">{stats.highRisk}</span>
            </div>
          </div>
          <div className="strip__cell">
            <div className="readout">
              <span className="readout__label">{labels.awaitingReview}</span>
              <span className="readout__value num">{stats.awaitingReview}</span>
            </div>
          </div>
          <div className="strip__cell">
            <div className="readout">
              <span className="readout__label">{labels.lastReadAt}</span>
              <span className="readout__value readout__value--mono">
                {stats.lastReadAt ? formatTimestamp(stats.lastReadAt) : "—"}
              </span>
            </div>
          </div>
        </div>

        {scoped?.scope === "all" ? null : (
          <p className="records__scope">
            总数是你名下的全部判读；带「本页」的三项只统计当前这一页（第 {page} / {pages}
            页），翻页会变。服务端聚合上线后会自动切到全量。
          </p>
        )}

        {fault ? (
          <FaultPanel
            code={fault.code}
            title="判读台账没有读出来"
            body={fault.text}
            endpoint="POST /diagnosis/list/page/my"
            onRetry={retry}
          />
        ) : null}

        {!fault && loading ? (
          <div className="records__skeleton" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="records__skeleton-row" key={index} />
            ))}
          </div>
        ) : null}

        {!fault && !loading && records.length === 0 ? (
          <div className="records__empty">
            <EmptyFrame label="暂无判读" />
            <p className="records__empty-title">还没有属于你的判读</p>
            <p className="records__empty-body">
              上传一张眼底影像开始第一次判读，记录会按时间倒序落在这本台账里。
            </p>
            <Link className="btn" to="/diagnosis">
              去判读 <span className="btn__key">↗</span>
            </Link>
          </div>
        ) : null}

        {!fault && !loading && records.length > 0 ? (
          <>
            <ul className="records__list">
              {records.map((item, index) => (
                <li key={item.id} className="records__item">
                  <button
                    type="button"
                    className="records__row"
                    data-cursor
                    aria-expanded={openId === item.id}
                    onClick={() => toggle(item.id)}
                  >
                    <span className="records__index num">
                      {String((page - 1) * PAGE_SIZE + index + 1).padStart(2, "0")}
                    </span>

                    <span className="records__thumb" aria-hidden="true">
                      {item.url ? (
                        <img src={item.url} alt="" loading="lazy" />
                      ) : (
                        <span className="records__thumb-none num">无影像</span>
                      )}
                    </span>

                    <span className="records__main">
                      <span className="records__disease">
                        {item.aiRejected ? "AI 拒识" : item.result || "未给出判读结果"}
                        <span className="records__code num">{classCode(item.result ?? undefined)}</span>
                      </span>
                      <span className="records__meta">
                        <span className="num">{formatTimestamp(item.createTime)}</span>
                        <span>·</span>
                        <span>{reexamineLabel(item.reexamineStatus)}</span>
                        {item.requiresReview && !item.aiRejected ? (
                          <>
                            <span>·</span>
                            <span>待人工复核</span>
                          </>
                        ) : null}
                      </span>
                    </span>

                    <span className="records__readout">
                      {item.aiRejected ? (
                        <RiskTag risk="critical">拒识</RiskTag>
                      ) : (
                        <>
                          <span className="readout__label">置信度</span>
                          <span className="records__conf num">{confidencePercent(item.confidence)}</span>
                          <RiskTag risk={severityRisk(item.severity ?? undefined)}>
                            {severityLabel(item.severity ?? undefined)}
                          </RiskTag>
                        </>
                      )}
                    </span>

                    <span className="records__caret" aria-hidden="true">
                      {openId === item.id ? "−" : "+"}
                    </span>
                  </button>

                  {openId === item.id ? (
                    <div className="records__detail">
                      {detail?.id === item.id ? (
                        detail.fault ? (
                          <FaultPanel
                            code={detail.fault.code}
                            title="这条记录没有读出来"
                            body={detail.fault.text}
                            endpoint={`GET /diagnosis/get/${item.id}`}
                            onRetry={retryDetail}
                          />
                        ) : detail.result ? (
                          <>
                            <RecordSheet
                              result={detail.result}
                              recordId={`IRIS-${item.id}`}
                              imageSrc={item.url ?? detail.result.url}
                              tone="paper"
                            />
                            {(() => {
                              const view = reexamineView(item, detail.reexamined)
                              if (!view) return null
                              if (view === "receipt") {
                                return (
                                  <div className="records__actions">
                                    <span className="records__actions-done">
                                      <RiskTag risk="attention">复审中</RiskTag>
                                      申请已提交，等待医生安排复诊。
                                    </span>
                                  </div>
                                )
                              }
                              return (
                                <div className="records__actions">
                                  {view === "reviewed" ? (
                                    <RiskTag risk="normal">已复审</RiskTag>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="btn"
                                    disabled={detail.submitting}
                                    onClick={() => void submitReexamine(item.id)}
                                  >
                                    {detail.submitting
                                      ? "提交中…"
                                      : view === "reviewed"
                                        ? "再次申请复诊"
                                        : "申请复诊"}
                                    <span className="btn__key">↻</span>
                                  </button>
                                  <span className="records__actions-note">
                                    提交后这条记录进入复诊队列，状态变为「复审中」。
                                  </span>
                                </div>
                              )
                            })()}
                          </>
                        ) : (
                          <div className="records__detail-loading num">读取中…</div>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="news__pager">
              <button
                type="button"
                className="news__pager-step"
                disabled={page <= 1}
                onClick={() => goPage(page - 1)}
              >
                ← 上一页
              </button>
              <span className="news__pager-state num">
                {page} / {pages} · 共 {stats.total} 条
              </span>
              <button
                type="button"
                className="news__pager-step"
                disabled={page >= pages}
                onClick={() => goPage(page + 1)}
              >
                下一页 →
              </button>
            </div>
          </>
        ) : null}
      </main>

      <DisclaimerBar />
    </div>
  )
}
