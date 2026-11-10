import { useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { SectionHead } from "@/components/SectionHead"
import { SiteFooter } from "@/components/SiteFooter"
import { SiteHeader } from "@/components/SiteHeader"
import { useSession } from "@/lib/session"

/**
 * 会话探测进行中：只画一块读数占位，不渲染 children，也不发起任何管理域请求。
 * 探测走 SessionProvider 的 getLoginUser（silentAuth），此处不做二次请求。
 */
function LoadingState() {
  return (
    <div className="is-field admin-gate">
      <main className="wrap admin-gate__inner">
        <SectionHead code="00" kicker="系统管理 · ADMINISTRATION" en="ACCESS" />
        <p className="overline">正在核对访问权限</p>
        <div className="readout">
          <span className="readout__label">状态</span>
          <span className="readout__value readout__value--mono">VERIFYING…</span>
        </div>
      </main>
    </div>
  )
}

/**
 * 兜底无权限说明页。自绘，不复用 PlaceholderPage 的「装配中」语义——
 * 这里不是页面没做完，是访问被拒。沿用全站外壳 + .sec-head / .overline / .btn 原语。
 * 匿名与非管理员共用同一版式，文案按原因区分。
 */
function DeniedPage({ anon }: { anon: boolean }) {
  return (
    <div className="is-field admin-denied">
      <SiteHeader />

      <main className="wrap admin-denied__inner">
        <SectionHead
          code="00"
          kicker="系统管理 · ADMINISTRATION"
          en="RESTRICTED AREA"
        />

        <p className="overline admin-denied__eyebrow">ACCESS DENIED</p>

        <h1 className="h2 admin-denied__title">
          {anon ? "系统管理需要管理员登录" : "当前账号没有管理权限"}
        </h1>
        <p className="lead admin-denied__body">
          {anon
            ? "你当前尚未登录。系统管理区用于维护账号、新闻、判读记录与知识库，仅对管理员开放。请登录后重新进入，或先返回主站。"
            : "你已登录，但当前账号不是管理员。系统管理区用于维护账号、新闻、判读记录与知识库，仅对管理员开放。如需访问权限请联系系统管理员，或先返回主站。"}
        </p>

        <div className="readout admin-denied__status">
          <span className="readout__label">访问状态</span>
          <span className="readout__value readout__value--mono">
            {anon ? "NOT AUTHENTICATED" : "INSUFFICIENT ROLE"}
          </span>
        </div>

        <div className="admin-denied__actions">
          <Link className="btn" to="/">
            回首页
            <span className="btn__key">HOME</span>
          </Link>
          {anon ? (
            <Link className="link" to="/login?redirect=/admin">
              去登录
              <span className="link__mark">↗</span>
            </Link>
          ) : null}
        </div>
      </main>

      <div className="wrap">
        <SiteFooter />
      </div>
    </div>
  )
}

/**
 * 会话没验成时的说明页。
 *
 * 与「无权限」是两件事：那边是账号不对，这边是服务没答话。
 * 混成同一页，用户会去反复登录，而问题根本不在账号上。
 */
function UnavailablePage({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="is-field admin-denied">
      <SiteHeader />

      <main className="wrap admin-denied__inner">
        <SectionHead
          code="00"
          kicker="系统管理 · ADMINISTRATION"
          en="SERVICE UNAVAILABLE"
        />

        <p className="overline admin-denied__eyebrow">SERVICE ERROR</p>

        <h1 className="h2 admin-denied__title">暂时核对不了访问权限</h1>
        <p className="lead admin-denied__body">
          {message}。这不是你的账号有问题，稍后重试即可；已经登录的会话不会被退出。
        </p>

        <div className="readout admin-denied__status">
          <span className="readout__label">访问状态</span>
          <span className="readout__value readout__value--mono">UNVERIFIED</span>
        </div>

        <div className="admin-denied__actions">
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void Promise.resolve(onRetry()).finally(() => setBusy(false))
            }}
          >
            {busy ? "重试中…" : "重新核对"}
            <span className="btn__key">RETRY</span>
          </button>
          <Link className="link" to="/">
            回首页
            <span className="link__mark">↗</span>
          </Link>
        </div>
      </main>

      <div className="wrap">
        <SiteFooter />
      </div>
    </div>
  )
}

/**
 * 路由守卫三分支：
 *   loading          → 读数占位，不渲染 children、不发请求
 *   authed && admin  → 放行 children
 *   anon / 非 admin  → 兜底无权限说明页
 *
 * 匿名态刻意不主动跳登录：session 探测走 silentAuth，不会广播 40100，
 * AuthRedirect 无从触发；等真正撞上管理域 API 的 40100 时再由全站机制带
 * ?redirect= 跳登录。这里只如实说明并给出口（回首页 / 去登录）。
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status, user, probeError, refresh } = useSession()

  if (status === "loading") return <LoadingState />

  if (status === "authed" && user?.userRole === "admin") return <>{children}</>

  // 服务没答话时先说服务，别把人引去登录——那是另一件事。
  if (probeError) return <UnavailablePage message={probeError} onRetry={() => void refresh()} />

  return <DeniedPage anon={status === "anon"} />
}
