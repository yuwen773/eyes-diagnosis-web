import { useEffect, useRef, type ReactElement, type ReactNode, type RefObject } from "react"

/**
 * 打开的弹层栈。Task 9 的流程里 Drawer（详情）与 Modal（复核）会同时打开：
 *   - 滚动锁用引用计数，最后一层关闭才还原 body overflow；
 *   - Esc 只由栈顶弹层响应，否则一次 Esc 会把两层一起关掉；
 *   - 焦点归还只在自己处于栈顶时执行，且归还目标必须仍在文档中
 *     （背景元素可能已因下层弹层关闭而卸载 / inert）。
 * 每项是一个稳定的 token（每次 open 生成），入栈顺序即开启顺序。
 */
let dialogStack: symbol[] = []
let savedBodyOverflow = ""

function lockBodyScroll() {
  if (dialogStack.length === 0) {
    savedBodyOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }
}

function unlockBodyScroll() {
  if (dialogStack.length === 0) {
    document.body.style.overflow = savedBodyOverflow
  }
}

function isTop(token: symbol): boolean {
  return dialogStack[dialogStack.length - 1] === token
}

/** 面板内可参与 Tab 的元素（与浏览器默认顺序一致，按 DOM 顺序）。 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal / Drawer 共用的受控弹层行为：
 *   - open 时把焦点移入面板（tabIndex=-1 的可聚焦容器），close 时归还给
 *     开启那一刻的 document.activeElement（触发元素）。
 *   - Esc 监听在 open 时挂、close 时卸，且只有栈顶弹层响应 Esc。
 *   - body 滚动锁定与还原（引用计数，支持叠层）。
 *
 * 焦点/滚动锁只在 open 切换时跑（不含 onClose），父级重渲染不会抢焦点；
 * Esc 监听单独挂，onClose 换身份只重挂监听，不动焦点。
 * 导出供 Drawer 复用，避免新建第六个文件。返回 panelRef 与栈顶判定：遮罩点击时只有
 * 栈顶弹层才响应（Drawer + Modal 叠开时点最上层遮罩不应连下层一起关），与 Esc 的栈守卫同源。
 */
export function useAdminDialog(open: boolean, onClose: () => void): {
  panelRef: RefObject<HTMLDivElement | null>
  isTop: () => boolean
} {
  const panelRef = useRef<HTMLDivElement | null>(null)
  // 两个 effect 共用同一个「本次 open 会话」的 token：Esc 监听在事件发生时
  // 读 tokenRef.current，不受 onClose 换身份导致 effect 重挂的影响。
  const tokenRef = useRef<symbol | null>(null)

  useEffect(() => {
    if (!open) return

    // 先记录触发元素，再把焦点移入面板——顺序不能反。
    const trigger = document.activeElement as HTMLElement | null
    const token = Symbol("admin-dialog")
    tokenRef.current = token
    lockBodyScroll()
    dialogStack = [...dialogStack, token]
    panelRef.current?.focus({ preventScroll: true })

    return () => {
      // 只有自己处于栈顶时才归还焦点：下层弹层关掉时，不应把焦点从
      // 仍打开的上层弹层里抢走，也不该落到已卸载 / inert 的元素上。
      const wasTop = isTop(token)
      dialogStack = dialogStack.filter((item) => item !== token)
      unlockBodyScroll()
      tokenRef.current = null
      if (wasTop && trigger && document.contains(trigger)) {
        trigger.focus({ preventScroll: true })
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (!tokenRef.current || !isTop(tokenRef.current)) return
      // 叠层时只有栈顶弹层处理 Esc，避免一次按键关掉两层。
      if (event.key === "Escape") {
        onClose()
        return
      }
      // Tab 在面板首尾循环：不拦的话焦点会跑到遮罩背后的后台控件上。
      if (event.key === "Tab") {
        const panel = panelRef.current
        if (!panel) return
        const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        const inside = active instanceof HTMLElement && panel.contains(active)
        if (event.shiftKey) {
          if (!inside || active === first) {
            event.preventDefault()
            last.focus()
          }
        } else if (!inside || active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // 栈顶判定在点击时实时读取 tokenRef.current：叠层时只有栈顶弹层的
  // 遮罩 onClick 会真正 onClose，下层遮罩点击被忽略（与 Esc 栈守卫对齐）。
  const checkTop = () => tokenRef.current !== null && isTop(tokenRef.current)

  return { panelRef, isTop: checkTop }
}

/**
 * 居中弹窗。遮罩复用全站 `.scrim` 词汇类；面板与遮罩是兄弟节点，
 * 点面板不会冒泡到遮罩，点面板外的遮罩才触发 onClose。
 * 内容区（__body）单独 overflow auto，头尾固定。
 */
export function Modal(props: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}): ReactElement {
  const { open, title, onClose, children, footer } = props
  const { panelRef, isTop } = useAdminDialog(open, onClose)

  return (
    <>
      <div
        className="scrim"
        data-open={open ? "true" : "false"}
        aria-hidden="true"
        onClick={() => {
          if (isTop()) onClose()
        }}
      />

      <div
        ref={panelRef}
        className="admin-modal"
        data-open={open ? "true" : "false"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        inert={!open}
      >
        <header className="admin-modal__head">
          <h2 className="admin-modal__title">{title}</h2>
          <button
            type="button"
            className="admin-modal__close"
            aria-label="关闭"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="admin-modal__body">{children}</div>

        {footer ? <footer className="admin-modal__foot">{footer}</footer> : null}
      </div>
    </>
  )
}
