import { memo, useEffect, useRef, useState, type CSSProperties } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ApiError, runDiagnosis, type DiagnosisResult } from "@/lib/api"
import { CLASSES } from "@/lib/domain"
import { useSession } from "@/lib/session"
import { rememberPendingUpload, takePendingUpload } from "@/lib/pendingUpload"
import { FaultNote } from "@/components/fault"
import { faultFromError, infoFault, validationFault, type Fault } from "@/lib/faults"
import { RecordSheet } from "@/components/RecordSheet"
import { SectionHead } from "@/components/SectionHead"
import { DisclaimerBar } from "@/components/DisclaimerBar"
import { SiteHeader } from "@/components/SiteHeader"

type Stage = "empty" | "ready" | "running" | "done" | "error"
type StepState = "idle" | "active" | "run" | "done" | "fail"

type LogLine = { key: string; text: string; note?: string; state: "done" | "run" | "fail" }

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = ["image/jpeg", "image/png"]

function validate(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return "只接受 JPG 与 PNG 格式的影像"
  if (file.size > MAX_BYTES) return "影像超过 5 MB，请压缩后重试"
  return null
}

/* 分划板：眼底相机目镜里的那圈刻度。空槽时是取景参考，读片时绕着影像转。 */
const RETICLE_TICKS = Array.from({ length: 72 }, (_, index) => {
  const angle = (index / 72) * Math.PI * 2
  const major = index % 6 === 0
  const inner = major ? 84 : 89
  return {
    x1: 100 + Math.cos(angle) * inner,
    y1: 100 + Math.sin(angle) * inner,
    x2: 100 + Math.cos(angle) * 94,
    y2: 100 + Math.sin(angle) * 94,
    major,
  }
})

/* 无 props，memo 后秒表每 100ms 重渲时不再重建 72 格刻度。 */
const Reticle = memo(function Reticle() {
  return (
    <svg className="slot__reticle" viewBox="0 0 200 200" aria-hidden="true">
      <g className="slot__ring">
        <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.45" />
        {RETICLE_TICKS.map((tick, index) => (
          <line
            key={index}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="currentColor"
            strokeWidth={tick.major ? 1 : 0.5}
            opacity={tick.major ? 0.85 : 0.4}
          />
        ))}
      </g>
      <circle cx="100" cy="100" r="76" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.55" />
      {/* 十字线只在环带里，中心留给提示文案 */}
      <line x1="100" y1="12" x2="100" y2="40" stroke="currentColor" strokeWidth="0.75" />
      <line x1="100" y1="160" x2="100" y2="188" stroke="currentColor" strokeWidth="0.75" />
      <line x1="12" y1="100" x2="40" y2="100" stroke="currentColor" strokeWidth="0.75" />
      <line x1="160" y1="100" x2="188" y2="100" stroke="currentColor" strokeWidth="0.75" />
    </svg>
  )
})

/** 秒表读数：分:秒.十分位，定宽不跳。 */
function clock(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`
}

const STEP_DEFS = [
  { code: "01", zh: "影像" },
  { code: "02", zh: "判读" },
  { code: "03", zh: "记录" },
]

const STEP_MARK: Record<StepState, string> = { idle: "", active: "·", run: "›", done: "✓", fail: "×" }

const STAGE_EN: Record<Stage, string> = {
  empty: "STANDBY",
  ready: "READY",
  running: "READING",
  done: "DONE",
  error: "FAIL",
}

export function DiagnosisPage() {
  const { status } = useSession()
  const navigate = useNavigate()

  // 未登录上传被送去登录页时暂存的影像；回来时一次取出，不留在本机。
  const [restored] = useState(() => takePendingUpload())
  const [file, setFile] = useState<File | null>(restored)
  const [preview, setPreview] = useState<string | null>(() =>
    restored ? URL.createObjectURL(restored) : null,
  )
  const previewRef = useRef<string | null>(preview)
  const [stage, setStage] = useState<Stage>(restored ? "ready" : "empty")
  // 故障只有一份：要么是这张图没通过检查（贴槽位），
  // 要么是这次判读没成（给重试）。
  const [fault, setFault] = useState<Fault | null>(() =>
    restored ? infoFault("已为你保留上次选择的影像，继续判读即可") : null,
  )
  const [faultScope, setFaultScope] = useState<"slot" | "run">("slot")
  const [needsLogin, setNeedsLogin] = useState(false)
  const [result, setResult] = useState<DiagnosisResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [dragging, setDragging] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const startedAt = useRef<number>(0)
  // 本次判读的代号。每次真正发起判读就换号，回来时先核对号对不对得上：
  // 对不上说明这次结果已经被换图或重置取代了，直接丢掉，绝不落到新的影像上。
  const runId = useRef(0)

  // 本地预览的 object URL 在换图/重置时手动释放；卸载时兜底清理一次。
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  // 计时器：只显示真实等待时长，不做进度假动作。
  useEffect(() => {
    if (stage !== "running") return
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - startedAt.current) / 1000)
    }, 100)
    return () => window.clearInterval(timer)
  }, [stage])

  function accept(next: File | null) {
    if (!next) return
    // 判读进行中不换图。在途请求的结论属于旧影像，落到新影像上就是张冠李戴，
    // 屏幕上会出现「这张片子的诊断结论配另一张片子」。等这次结果出来再换。
    if (stage === "running") {
      setFault(infoFault("判读进行中，请等这次结果出来再换图"))
      setFaultScope("slot")
      return
    }
    const problem = validate(next)
    if (problem) {
      setFault(validationFault(problem))
      setFaultScope("slot")
      setNeedsLogin(false)
      return
    }
    setFault(null)
    setNeedsLogin(false)
    setResult(null)
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    const url = URL.createObjectURL(next)
    previewRef.current = url
    setPreview(url)
    setFile(next)
    setStage("ready")
  }

  async function diagnose() {
    if (!file) return
    const id = ++runId.current
    setStage("running")
    setFault(null)
    setNeedsLogin(false)
    setResult(null)
    setElapsed(0)
    startedAt.current = Date.now()

    try {
      const value = await runDiagnosis(file)
      const floor = 900 - (Date.now() - startedAt.current)
      if (floor > 0) await new Promise((resolve) => window.setTimeout(resolve, floor))
      // 号对不上：这次判读期间用户换了图或点了重置，结果已经没有归属，丢掉。
      if (runId.current !== id) return
      setResult(value)
      setStage("done")
    } catch (cause) {
      if (runId.current !== id) return
      setStage("error")
      setFaultScope("run")
      const loginRequired = cause instanceof ApiError && cause.code === 40100
      setNeedsLogin(loginRequired)
      // 路由层马上会送去登录页；先把影像暂存，回来还能接着判读。
      if (loginRequired) rememberPendingUpload(file)
      setFault(
        faultFromError(cause, {
          intent: "load",
          action: { label: "重试", run: () => void diagnose() },
        }),
      )
    }
  }

  function reset() {
    // 作废在途请求：结果回来时已经没有对应的影像了。
    runId.current += 1
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
    setPreview(null)
    setFile(null)
    setResult(null)
    setStage("empty")
    setFault(null)
    setNeedsLogin(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  // 未登录时撞上 40100：路由层会送人去登录页，这里只把话说清楚。
  const showLoginHint = needsLogin && status === "anon"

  if (result) {
    return (
      <div className="is-field">
        <SiteHeader />

        <div className="sheet-shell">
          <div className="wrap">
            <div className="no-print" style={{ marginBottom: 20 }}>
              <SectionHead code="判读" kicker="Reading record" en="Iris · B4" />
            </div>

            <RecordSheet
              result={result}
              recordId={result.id ? `IRIS-${result.id}` : undefined}
              imageSrc={preview ?? undefined}
              actions={
                <>
                  <button className="btn btn--ghost btn--sm" type="button" onClick={() => window.print()}>
                    打印记录
                  </button>
                  <button className="btn btn--ghost btn--sm" type="button" onClick={reset}>
                    换一张影像
                  </button>
                  <Link className="link" to="/" style={{ marginLeft: "auto" }}>
                    返回首页
                  </Link>
                </>
              }
            />
          </div>
        </div>

        <DisclaimerBar />
      </div>
    )
  }

  // 程序条三步的状态。第三步（记录）在本页永远是路标——出结果即跳去记录纸。
  function stepStateOf(index: number): StepState {
    if (index === 0) return file ? "done" : "active"
    if (index === 1) {
      if (stage === "running") return "run"
      if (stage === "error") return "fail"
      if (stage === "done") return "done"
      return file ? "active" : "idle"
    }
    return "idle"
  }

  const sizeMB = file ? (file.size / 1048576).toFixed(1) : null

  const log: LogLine[] = []
  if (file) {
    log.push({
      key: "check",
      text: file.name,
      note: `${sizeMB} MB · PASS`,
      state: "done",
    })
  }
  if (stage === "running" || stage === "done") {
    log.push({ key: "send", text: "发送判读请求", note: "POST /diagnosis/diagnosis", state: "done" })
    log.push({
      key: "wait",
      text: "等待模型响应",
      note: `${elapsed.toFixed(1)} s`,
      state: stage === "running" ? "run" : "done",
    })
  }
  if (stage === "error") {
    log.push({ key: "fail", text: fault?.title ?? "请求失败", note: "FAIL", state: "fail" })
  }

  return (
    <div className="is-field">
      <SiteHeader />

      <main className="wrap">
        <div className="proc fade" role="list" aria-label="判读流程">
          {STEP_DEFS.map((step, index) => {
            const state = stepStateOf(index)
            return (
              <div className="proc__step" data-state={state} role="listitem" key={step.code}>
                <span className="proc__code num">{step.code}</span>
                <span className="proc__zh">{step.zh}</span>
                <span className="proc__mark" aria-hidden="true">
                  {STEP_MARK[state]}
                </span>
              </div>
            )
          })}
          <div className="proc__state num" data-state={stage}>
            {STAGE_EN[stage]}
          </div>
        </div>

        <div className="diag">
          <section className="diag__left rise">
            <p className="overline">Upload · 影像</p>
            <h1 className="h2 diag__title" style={{ marginTop: 12, marginBottom: 10 }}>
              上传一张彩色眼底照片
            </h1>
            <p className="small" style={{ marginBottom: 24, maxWidth: "34em" }}>
              单眼、清晰、光照均匀。系统会先过质量门，不合格的影像不会给出结论。
            </p>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              disabled={stage === "running"}
              onChange={(event) => accept(event.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              className="slot"
              data-busy={stage === "running"}
              data-drag={dragging}
              data-filled={preview ? "true" : "false"}
              onClick={() => {
                if (stage !== "running") inputRef.current?.click()
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                accept(event.dataTransfer.files?.[0] ?? null)
              }}
              aria-label="选择或拖入眼底照片"
            >
              <span className="slot__ticks" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
              <Reticle />

              {preview ? (
                <>
                  <img className="slot__img" src={preview} alt="待判读的眼底照片" />
                  <span className="slot__crosshair" aria-hidden="true" />
                  {stage === "running" ? (
                    <span className="slot__timer num" aria-hidden="true">
                      <span>READING · B4</span>
                      <span>T+ {clock(elapsed)}</span>
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="slot__prompt">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.25"
                      strokeLinecap="square"
                    />
                    <path d="M4 15v4.5h16V15" stroke="currentColor" strokeWidth="1.25" />
                  </svg>
                  <span className="slot__title">{dragging ? "松手，放入影像" : "点击或拖入影像"}</span>
                  <span className="slot__hint">JPG · PNG · ≤ 5 MB</span>
                </span>
              )}
            </button>

            <div className="slot__actions">
              {stage === "ready" || stage === "error" ? (
                <button className="btn" type="button" onClick={diagnose}>
                  开始判读
                  <span className="btn__key">B4</span>
                </button>
              ) : null}
              {stage === "running" ? (
                <button className="btn" type="button" disabled>
                  正在判读…
                </button>
              ) : null}
              {file ? (
                <button className="btn btn--ghost" type="button" onClick={reset} disabled={stage === "running"}>
                  移除
                </button>
              ) : null}
            </div>

            {file ? (
              <p className="slot__meta num">
                {file.name} · {file.type === "image/png" ? "PNG" : "JPEG"} · {sizeMB} MB
              </p>
            ) : null}

            {showLoginHint ? (
              <div style={{ marginTop: 16 }}>
                <FaultNote
                  fault={{
                    severity: "attention",
                    kind: "auth",
                    tag: "AUTH",
                    title: "判读需要登录",
                    detail: "登录后这张影像的判读结果会归档到你的账号下。",
                    code: 40100,
                  }}
                  action={{
                    label: "去登录",
                    run: () => navigate("/login?redirect=/diagnosis"),
                  }}
                />
              </div>
            ) : fault ? (
              <div style={{ marginTop: faultScope === "run" ? 16 : 12 }}>
                <FaultNote fault={fault} variant={faultScope === "run" ? "block" : "field"} />
              </div>
            ) : null}
          </section>

          <section className="diag__right rise" style={{ "--d": "90ms" } as CSSProperties}>
            <SectionHead code="判读" kicker="Readout" en="LIVE" />

            <ol className="journal" aria-live="polite">
              {log.length === 0 ? (
                <li data-state="idle">
                  <span>·</span>
                  <span>等待影像</span>
                  <span>—</span>
                </li>
              ) : (
                log.map((line) => (
                  <li key={line.key} data-state={line.state}>
                    <span>{line.state === "run" ? "›" : line.state === "fail" ? "×" : "✓"}</span>
                    <span>{line.text}</span>
                    <span>{line.note}</span>
                  </li>
                ))
              )}
            </ol>

            <div className="roster">
              <SectionHead code="八类" kicker="Model scope" en="08 CLASSES" />
              <ul className="roster__list">
                {CLASSES.map((item) => (
                  <li key={item.code}>
                    <span className="roster__code num">{item.code}</span>
                    <span className="roster__name">{item.name}</span>
                  </li>
                ))}
              </ul>
              <p className="small">
                无法归入八类的改变会标为「其他」，并转人工判读。
              </p>
            </div>

            <div className="diag__foot" aria-hidden="true">
              <span>MODEL · EFFICIENTNET-B4</span>
              <span>GATE · ON</span>
              <span>SESSION · {status.toUpperCase()}</span>
            </div>
          </section>
        </div>
      </main>

      <DisclaimerBar />
    </div>
  )
}
