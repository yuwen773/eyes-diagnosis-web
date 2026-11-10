// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { getChatHistory, getSessions, type AgentSessionVO, type ChatHistoryVO } from "@/lib/api"
import { AgentPage } from "./AgentPage"

const sessionState = vi.hoisted(() => ({
  status: "anon" as string,
  user: null as null | { id: number; userAccount: string },
}))

vi.mock("@/lib/session", () => ({
  useSession: () => ({
    status: sessionState.status,
    user: sessionState.user,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}))

const sendMock = vi.hoisted(() => vi.fn())
// reset 必须整个会话稳定——否则初始化 effect 每次渲染都重跑，历史被反复拉取。
const resetMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/agentStream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agentStream")>()
  const React = await import("react")
  return {
    // 保留 mapHistoryMessage 等真实导出：AgentPage 用它把历史映射成流消息。
    ...actual,
    useAgentStream: () => {
      const [messages, setMessages] = React.useState<unknown[]>([])
      return {
        messages,
        isStreaming: false,
        resources: { images: [], links: [] },
        send: sendMock,
        abort: vi.fn(),
        pushUser: (message: unknown) => setMessages((prev) => [...prev, message]),
        setMessages,
        reset: resetMock,
      }
    },
  }
})

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    getSessions: vi.fn().mockResolvedValue([]),
    getChatHistory: vi.fn(),
    generateTitle: vi.fn().mockResolvedValue(true),
  }
})

const originalRandomUUID = globalThis.crypto.randomUUID

afterEach(() => {
  cleanup()
  sessionState.status = "anon"
  sessionState.user = null
  localStorage.clear()
  vi.mocked(getSessions).mockResolvedValue([])
  vi.mocked(getChatHistory).mockReset()
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: originalRandomUUID,
    configurable: true,
  })
})

/** jsdom 没有 matchMedia——主题探测要用。 */
function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe("AgentPage 未登录", () => {
  it("先展示界面，不直接把人踢去登录页", () => {
    stubMatchMedia()
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/agent"]}>
          <Routes>
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/login" element={<div>登录页</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )
    // 界面在，欢迎屏可见
    expect(screen.getByRole("heading", { name: "Iris" })).toBeTruthy()
    expect(screen.queryByText("登录页")).toBeNull()
  })

  it("收起会话栏后左栏折叠（常驻 DOM + 宽度动画），对话区不被压窄", () => {
    stubMatchMedia()
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/agent"]}>
          <Routes>
            <Route path="/agent" element={<AgentPage />} />
            <Route path="/login" element={<div>登录页</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole("button", { name: "收起会话栏" }))

    const layout = document.querySelector(".agent-layout")!
    expect(layout.className).toContain("is-left-collapsed")
    // 会话栏常驻 DOM，只是折叠——移除会让中栏自动排进左列而塌成窄条
    expect(document.querySelector(".agent-layout__left.is-collapsed")).toBeTruthy()
    expect(document.querySelector(".agent-sessions")).toBeTruthy()
    // 左上角恢复钮组在
    expect(screen.getByRole("button", { name: "展开会话栏" })).toBeTruthy()
    // 再展开，侧栏回来
    fireEvent.click(screen.getByRole("button", { name: "展开会话栏" }))
    expect(document.querySelector(".agent-layout__left.is-collapsed")).toBeNull()
    expect(document.querySelector(".agent-sessions")).toBeTruthy()
  })

  it("切换会话后旧历史不落到新会话", async () => {
    sessionState.status = "authed"
    sessionState.user = { id: 1, userAccount: "tester" }
    const session = (id: string, title: string): AgentSessionVO => ({
      sessionId: id,
      title,
      lastMessage: "",
      messageCount: 1,
      summaryContent: "",
      createdTime: "2026-11-08 10:00:00",
      updatedTime: "2026-11-08 10:00:00",
    })
    vi.mocked(getSessions).mockResolvedValue([session("A", "会话 A"), session("B", "会话 B")])

    const deferred = () => {
      let resolve!: (value: ChatHistoryVO) => void
      const promise = new Promise<ChatHistoryVO>((r) => {
        resolve = r
      })
      return { promise, resolve }
    }
    const historyA = deferred()
    const historyB = deferred()
    vi.mocked(getChatHistory).mockImplementation((id) =>
      id === "A" ? historyA.promise : historyB.promise,
    )
    const history = (content: string): ChatHistoryVO => ({
      messages: [
        { id: 1, role: "ASSISTANT", subType: "", content, isSummary: false, createdTime: "2026-11-08 10:00:00" },
      ],
      hasMore: false,
      nextCursor: null,
    })

    stubMatchMedia()
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/agent"]}>
          <Routes>
            <Route path="/agent" element={<AgentPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    // A 的请求先发出、B 的请求后发出——但 A 晚到，不能覆盖已经显示的 B。
    fireEvent.click(await screen.findByRole("button", { name: /会话 A/ }))
    fireEvent.click(await screen.findByRole("button", { name: /会话 B/ }))
    await act(async () => historyB.resolve(history("B 的新消息")))
    expect(await screen.findByText("B 的新消息")).toBeTruthy()

    await act(async () => historyA.resolve(history("A 的旧消息")))
    expect(screen.queryByText("A 的旧消息")).toBeNull()
    expect(screen.getByText("B 的新消息")).toBeTruthy()
  })

  it("非安全上下文没有 crypto.randomUUID 时也能发送", async () => {
    sessionState.status = "authed"
    sessionState.user = { id: 1, userAccount: "tester" }
    // 内网 http 部署下 crypto.randomUUID 不存在——发消息不能因此崩掉。
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    })
    stubMatchMedia()

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/agent"]}>
          <Routes>
            <Route path="/agent" element={<AgentPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    const textarea = (await screen.findByPlaceholderText(
      /Enter 发送/,
    )) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "没有 randomUUID" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1))
  })

  it("发送失败时撤回乐观消息，输入框保留原文", async () => {
    sessionState.status = "authed"
    sessionState.user = { id: 1, userAccount: "tester" }
    sendMock.mockRejectedValueOnce(new Error("boom"))
    stubMatchMedia()

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={["/agent"]}>
          <Routes>
            <Route path="/agent" element={<AgentPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    )

    const textarea = (await screen.findByPlaceholderText(
      /Enter 发送/,
    )) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "发不出去的话" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(textarea.value).toBe("发不出去的话"))
    // 乐观插入的用户气泡已撤回——否则重试会出现两条一模一样的消息。
    // textarea 的 value 也会被 getByText 命中，这里只看非输入框节点。
    const bubbles = screen
      .queryAllByText("发不出去的话")
      .filter((node) => node.tagName !== "TEXTAREA")
    expect(bubbles).toHaveLength(0)
  })
})
