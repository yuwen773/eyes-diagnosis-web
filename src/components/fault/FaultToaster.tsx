import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { Fault, FaultSeverity } from "@/lib/faults"

/**
 * 瞬时故障读数（右上角浮条）+ 全局投放口。
 *
 * 页面上任何一次失败都该有一句统一的说法：出现方式、停留时长、能不能关掉、
 * 要不要给「重试」，全站一致。页面只管把故障丢进来（`useFault().push`），
 * 不自己写浮层。
 */

type Toast = {
  id: string
  fault: Fault
  phase: "in" | "out"
}

type FaultApi = {
  /** 丢一条故障进来。 */
  push: (fault: Fault) => void
  /** 收掉一条。 */
  dismiss: (id: string) => void
  /** 当前挂着哪些（渲染用）。 */
  toasts: Toast[]
}

const NOOP: FaultApi = { push: () => {}, dismiss: () => {}, toasts: [] }

const FaultContext = createContext<FaultApi | null>(null)

/** 停留时长：越严重给越久，但都留了关闭。 */
const DWELL: Record<FaultSeverity, number> = {
  info: 4000,
  attention: 6000,
  critical: 9000,
}

/** 同时最多挂几条——再多就成墙了。 */
const MAX_TOASTS = 3

export function FaultProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, phase: "out" as const } : t)),
    )
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 200)
  }, [])

  const push = useCallback((fault: Fault) => {
    const id = crypto.randomUUID()
    const toast: Toast = { id, fault, phase: "in" }
    setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS))
  }, [])

  const value = useMemo<FaultApi>(() => ({ push, dismiss, toasts }), [push, dismiss, toasts])

  return <FaultContext.Provider value={value}>{children}</FaultContext.Provider>
}

/**
 * 投放口。
 *
 * 没有 Provider 时（组件单测里单独渲染）退化成空操作，不抛错——
 * 提示系统挂掉不该连带把页面弄崩。
 */
export function useFault(): FaultApi {
  return useContext(FaultContext) ?? NOOP
}

function FaultToast({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { fault } = toast
  const [paused, setPaused] = useState(false)
  const left = useRef(DWELL[fault.severity])
  // 渲染期不能读时钟（不纯）；进入计时 effect 时再落一次时间戳。
  const since = useRef(0)

  useEffect(() => {
    if (paused) return
    if (!since.current) since.current = Date.now()
    const timer = window.setTimeout(() => onDismiss(toast.id), left.current)
    return () => window.clearTimeout(timer)
  }, [paused, toast.id, onDismiss])

  function onEnter() {
    left.current = Math.max(600, left.current - (Date.now() - since.current))
    since.current = Date.now()
    setPaused(true)
  }

  function onLeave() {
    since.current = Date.now()
    setPaused(false)
  }

  return (
    <div
      className={`fault-toast fault-tone-${fault.severity}`}
      data-phase={toast.phase}
      role={fault.severity === "critical" ? "alert" : "status"}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="fault-toast__head">
        <span className="fault-toast__tag num">{fault.tag}</span>
        {fault.code != null && <span className="fault-toast__code num">{fault.code}</span>}
      </div>
      <p className="fault-toast__title">{fault.title}</p>
      {fault.detail && <p className="fault-toast__detail">{fault.detail}</p>}
      {fault.action && (
        <button
          type="button"
          className="fault-toast__action"
          onClick={() => {
            fault.action?.run()
            onDismiss(toast.id)
          }}
        >
          {fault.action.label}
        </button>
      )}
      <button
        type="button"
        className="fault-toast__close"
        aria-label="关闭提示"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}

/** 提示宿主：挂在应用根部，一处渲染，全站可用。 */
export function FaultToaster() {
  const { toasts, dismiss } = useFault()
  if (toasts.length === 0) return null
  return (
    <div className="fault-stack" aria-live="polite">
      {toasts.map((toast) => (
        <FaultToast key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  )
}
