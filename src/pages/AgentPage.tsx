import { useCallback, useEffect, useRef, useState } from "react"
import {
  batchDeleteSessions,
  deleteSession,
  exportSession,
  generateTitle,
  getChatHistory,
  getSessions,
  updatePinStatus,
  updateSessionTitle,
  type AgentSessionVO,
} from "@/lib/api"
import { useAgentStream, mapHistoryMessage } from "@/lib/agentStream"
import { createAgentUploader } from "@/lib/agentUpload"
import { useSession } from "@/lib/session"
import { loadThreadId, saveThreadId } from "@/lib/threadStorage"
import { faultFromError } from "@/lib/faults"
import { useFault } from "@/components/fault"
import { MessageList } from "@/components/agent/MessageList"
import { ChatInput } from "@/components/agent/ChatInput"
import { SessionList } from "@/components/agent/SessionList"
import { ResourcePanel } from "@/components/agent/ResourcePanel"
import { SiteHeader } from "@/components/SiteHeader"

const HISTORY_PAGE_SIZE = 100

const generateThreadId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

/** 文件名净化：去掉路径分隔符与系统不允许的字符。 */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim()
  return cleaned || "会话"
}

/** Blob 下载：必须挂进 DOM 再点击，且 revoke 要等一拍，否则部分浏览器下载静默失败。 */
function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function AgentPage() {
  const { status, user } = useSession()

  // 与 useAgentStream 的 messages 单一数据源：历史加载也走 setMessages
  const stream = useAgentStream()
  const { messages, isStreaming, resources, send, abort, pushUser, setMessages, reset } = stream
  // 上传器每次创建返新对象——不固定住的话 handleSend 的 useCallback
  // 依赖每渲染都变，等于没有 memo。用惰性 state 只建一次。
  const [uploader] = useState(createAgentUploader)

  const [threadId, setThreadId] = useState(() => generateThreadId())
  // 追踪当前会话：发送期间用户可能切会话，闭包里的 threadId 是旧值，
  // 判断「是否还在这个会话」必须读 ref。渲染期写 ref 在并发模式下不安全，
  // 所以在 effect 里同步。
  const threadIdRef = useRef(threadId)
  useEffect(() => {
    threadIdRef.current = threadId
  }, [threadId])
  // 历史响应的序号：切会话后，旧请求晚到也不能把内容写进新会话。
  const historySeq = useRef(0)
  // 当前登录身份的稳定键：登录/登出/换账号时要清掉上一个身份的会话态。
  const userKey = user?.id ?? null
  const lastUserKeyRef = useRef<number | null | undefined>(undefined)
  const [currentThreadId, setCurrentThreadId] = useState("")
  const [sessions, setSessions] = useState<AgentSessionVO[]>([])
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState("")
  const [busy, setBusy] = useState(false)
  // 失败一律走全站统一的瞬时读数，不再在正文里插一条横幅。
  const { push: pushFault } = useFault()

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await getSessions())
    } catch (e) {
      console.warn("加载会话列表失败", e)
    }
  }, [])

  const loadHistoryMessages = useCallback(
    async (id: string) => {
      const seq = ++historySeq.current
      setHistoryLoading(true)
      try {
        const data = await getChatHistory(id, undefined, HISTORY_PAGE_SIZE)
        // 晚到的旧会话历史不能覆盖当前会话——序号变了或人已经切走，直接丢弃。
        if (seq !== historySeq.current || threadIdRef.current !== id) return
        setMessages((data.messages ?? []).map(mapHistoryMessage))
      } catch (e) {
        if (seq === historySeq.current) pushFault(faultFromError(e, { intent: "load" }))
      } finally {
        if (seq === historySeq.current) setHistoryLoading(false)
      }
    },
    [setMessages, pushFault],
  )

  useEffect(() => {
    if (status !== "authed") return
    // 登录身份变了（首次登录 / 换账号）：先清掉上一个身份的会话态，
    // 再按新身份的 key 恢复；否则会拿别人的会话 id 去拉历史。
    if (lastUserKeyRef.current !== userKey) {
      lastUserKeyRef.current = userKey
      setThreadId(generateThreadId())
      setCurrentThreadId("")
      reset()
    }
    const savedThreadId = loadThreadId(userKey)
    void refreshSessions()
    if (savedThreadId) {
      void loadHistoryMessages(savedThreadId)
      // 没有已保存的会话时保留初始化时生成的 threadId：
      // 用空串覆盖会让首条消息以空 threadId 发出，后端随即另建一个会话，
      // 前端却仍把消息挂在这个空 id 上，两边就此分叉。
      setCurrentThreadId(savedThreadId)
      setThreadId(savedThreadId)
    }
  }, [status, userKey, reset, refreshSessions, loadHistoryMessages])

  const handleSend = useCallback(
    async (text: string, files: File[] = []): Promise<boolean> => {
      if ((!text.trim() && files.length === 0) || isStreaming) return false

      // 必须在 pushUser 之前判断：用户消息推入后 messages 已非空，
      // 放到后面判断会让"是否首条消息"永远为假，标题生成从不触发。
      const isFirstMessage = messages.length === 0
      // 本回合用的会话 id：发送过程中用户可能切了会话，收尾时只能写回这一个
      const usedThreadId = threadId

      let imageUrls: string[] = []
      try {
        if (files.length > 0) {
          const result = await uploader.uploadFiles(files)
          imageUrls = result.urls
        }
      } catch (e) {
        pushFault(faultFromError(e, { intent: "upload" }))
        return false
      }

      const localId = crypto.randomUUID()
      pushUser({
        id: localId,
        type: "user",
        content: text,
        time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        images: imageUrls,
      })

      try {
        await send(text, usedThreadId, imageUrls)
        uploader.commitSuccess(imageUrls)
        // 只在仍停留在这个会话时才写回——用户中途切走就别覆盖他的选择
        if (threadIdRef.current === usedThreadId) {
          saveThreadId(userKey, usedThreadId)
          setCurrentThreadId(usedThreadId)
        }

        // 首条消息触发 AI 生成标题，完成后刷新列表
        if (isFirstMessage) {
          void generateTitle(usedThreadId, text)
            .then(() => refreshSessions())
            .catch((e) => console.warn("标题生成触发失败", e))
        }
        return true
      } catch (e) {
        uploader.commitFailure(imageUrls)
        // 发送失败：撤回乐观消息，输入框会保留原文，重试时才不会出现两条一样的用户气泡。
        setMessages((prev) => prev.filter((message) => message.id !== localId))
        pushFault(faultFromError(e, { intent: "send" }))
        return false
      }
    },
    [isStreaming, messages.length, threadId, userKey, uploader, pushUser, send, refreshSessions, pushFault],
  )

  const handleNewChat = useCallback(() => {
    saveThreadId(userKey, "")
    setCurrentThreadId("")
    setThreadId(generateThreadId())
    reset()
    setPanelOpen(false)
  }, [reset, userKey])

  const handleSelectHistory = useCallback(
    async (id: string) => {
      setCurrentThreadId(id)
      setThreadId(id)
      saveThreadId(userKey, id)
      reset()
      setPanelOpen(false)
      await loadHistoryMessages(id)
    },
    [reset, userKey, loadHistoryMessages],
  )

  /** 删除/置顶/重命名后刷新列表（Vue 版这里漏绑导致列表不刷新，勿复刻）。 */
  const afterSessionChange = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true)
      try {
        await action()
        await refreshSessions()
        return true
      } catch (e) {
        pushFault(faultFromError(e, { intent: "load" }))
        return false
      } finally {
        setBusy(false)
      }
    },
    [refreshSessions, pushFault],
  )

  const handleDelete = useCallback(
    (id: string) => {
      void afterSessionChange(() => deleteSession(id)).then((ok) => {
        // 删除失败时不清空当前对话——否则会话还在服务端，用户却以为删掉了
        if (ok && id === currentThreadId) handleNewChat()
      })
    },
    [afterSessionChange, currentThreadId, handleNewChat],
  )

  const handleBatchDelete = useCallback(
    (ids: string[]) => {
      void afterSessionChange(() => batchDeleteSessions(ids)).then((ok) => {
        if (ok && ids.includes(currentThreadId)) handleNewChat()
      })
    },
    [afterSessionChange, currentThreadId, handleNewChat],
  )

  const handleExport = useCallback(
    (id: string, format: "markdown" | "json") => {
      void afterSessionChange(async () => {
        const content = await exportSession(id, format)
        const session = sessions.find((s) => s.sessionId === id)
        const base = safeFileName(session?.title || "会话")
        downloadText(
          content,
          `${base}.${format === "json" ? "json" : "md"}`,
          format === "json" ? "application/json" : "text/markdown",
        )
      })
    },
    [afterSessionChange, sessions],
  )

  if (status === "loading") {
    return (
      <div className="is-field">
        <SiteHeader />
        <main className="agent-viewport">
          <p className="num" style={{ color: "var(--fg-3)", padding: 16 }}>
            LOADING…
          </p>
        </main>
      </div>
    )
  }

  // 未登录不拦页面：先把界面给出来，等真的调 agent 接口拿到 40100/40101
  // 再由路由层跳登录页（带回跳地址）。
  // 同 Vue 版 BasicLayout：agent 页不出页脚、不进版心，三栏铺满顶栏以下视口。
  return (
    <div className="is-field">
      <SiteHeader />

      <main className="agent-viewport">
        <div className={`agent-layout${sessionsCollapsed ? " is-left-collapsed" : ""}`}>
          {/* 会话栏常驻 DOM（同 Vue 版 AgentChatLayout）：收起靠宽度动画，
              从 DOM 摘掉会让中栏自动排进左列而塌成窄条。 */}
          <div className={`agent-layout__left${sessionsCollapsed ? " is-collapsed" : ""}`}>
            <SessionList
              sessions={sessions}
              activeId={currentThreadId}
              busy={busy}
              onNewChat={handleNewChat}
              onSelect={(id) => void handleSelectHistory(id)}
              onRename={(id, title) =>
                void afterSessionChange(() => updateSessionTitle(id, title))
              }
              onDelete={handleDelete}
              onBatchDelete={handleBatchDelete}
              onTogglePin={(id, pinned) =>
                void afterSessionChange(() => updatePinStatus(id, pinned))
              }
              onExport={handleExport}
              onCollapse={() => setSessionsCollapsed(true)}
            />
          </div>

          <div className={`agent-main${sessionsCollapsed ? " is-left-collapsed" : ""}`}>
            <MessageList
              messages={messages}
              loading={historyLoading}
              streaming={isStreaming}
              onSend={(text) => void handleSend(text)}
              onPreviewImage={(url) => setPreviewUrl(url)}
              headLeft={
                <>
                  {/* 折叠后的左栏操作组（同 Vue 版 collapsed-actions） */}
                  {sessionsCollapsed && (
                    <div role="toolbar" aria-label="侧边栏操作" className="agent-collapsed-actions">
                      <button
                        type="button"
                        className="agent-collapsed-actions__btn"
                        onClick={() => setSessionsCollapsed(false)}
                        aria-label="展开会话栏"
                        title="展开会话栏"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <line x1="3" y1="12" x2="21" y2="12" />
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="agent-collapsed-actions__btn is-accent"
                        onClick={handleNewChat}
                        aria-label="新建对话"
                        title="新建对话"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {status === "anon" && (
                    <span className="agent-main__anon num">未登录 · 发送时将引导登录</span>
                  )}
                </>
              }
              headRight={
                /* 资源面板切换钮（同 Vue 版 toggle-right-btn：图标钮 + 徽标） */
                <button
                  type="button"
                  className={`agent-main__resource-toggle${panelOpen ? " is-active" : ""}`}
                  onClick={() => setPanelOpen((v) => !v)}
                  aria-expanded={panelOpen}
                  aria-label="资源面板"
                  title="资源面板"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  {resources.images.length + resources.links.length > 0 && (
                    <span className="agent-main__resource-badge num">
                      {resources.images.length + resources.links.length}
                    </span>
                  )}
                </button>
              }
            />

            <ChatInput
              disabled={false}
              streaming={isStreaming}
              onSend={handleSend}
              onStop={abort}
            />
          </div>

          {panelOpen && (
            <ResourcePanel
              open
              resources={resources}
              onClose={() => setPanelOpen(false)}
              onPreviewImage={(url) => setPreviewUrl(url)}
            />
          )}
        </div>
      </main>

      {previewUrl && (
        <div className="agent-preview" onClick={() => setPreviewUrl("")} role="dialog" aria-label="图片预览">
          <img src={previewUrl} alt="预览" onClick={(e) => e.stopPropagation()} />
          <a
            className="agent-preview__open num"
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            原图 ↗
          </a>
        </div>
      )}

    </div>
  )
}
