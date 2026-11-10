// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { useAgentStream } from "./agentStream"
import type { AgentStreamDTO } from "./api"

const streamChatMock = vi.hoisted(() => vi.fn())

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api")
  return { ...actual, streamChat: streamChatMock }
})

/** 造一个可手动推进的流：返回 handlers 与一个「结束」动作。 */
function fakeStream() {
  let handlers: {
    onEvent(dto: AgentStreamDTO): void
    onDone(): void
    onError(err: unknown): void
  } | null = null
  let signal: AbortSignal | null = null

  streamChatMock.mockImplementation(
    async (_body: unknown, h: typeof handlers, sig: AbortSignal) => {
      handlers = h
      signal = sig
      // 挂起，直到 abort 或测试主动结束
      await new Promise<void>((resolve) => {
        sig.addEventListener("abort", () => resolve(), { once: true })
        ;(resolve as unknown as { __done?: () => void }).__done = resolve
      })
    },
  )

  return {
    emit(dto: AgentStreamDTO) {
      act(() => {
        handlers?.onEvent(dto)
      })
    },
    finish() {
      act(() => {
        handlers?.onDone()
      })
    },
    get signal() {
      return signal
    },
  }
}

/** 把 hook 挂进测试组件。 */
function Probe({ onReady }: { onReady: (api: ReturnType<typeof useAgentStream>) => void }) {
  const api = useAgentStream()
  onReady(api)
  return (
    <div>
      <span data-testid="streaming">{String(api.isStreaming)}</span>
      <span data-testid="loading">
        {String(api.messages.some((m) => m.isLoading))}
      </span>
      <span data-testid="count">{api.messages.length}</span>
    </div>
  )
}

describe("useAgentStream", () => {
  beforeEach(() => {
    streamChatMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("切会话（reset）会中断在途 SSE，不让旧回合的 token 写进新会话", async () => {
    const stream = fakeStream()
    let api!: ReturnType<typeof useAgentStream>
    render(<Probe onReady={(a) => (api = a)} />)

    await act(async () => {
      void api.send("你好", "thread-A")
    })
    expect(stream.signal?.aborted).toBe(false)

    act(() => {
      api.reset()
    })

    expect(stream.signal?.aborted).toBe(true)
    expect(api.messages).toHaveLength(0)
  })

  it("停止（abort）后消息收尾：不再有 isLoading 的消息", async () => {
    const stream = fakeStream()
    let api!: ReturnType<typeof useAgentStream>
    render(<Probe onReady={(a) => (api = a)} />)

    await act(async () => {
      void api.send("你好", "thread-A")
    })
    stream.emit({ messageType: "assistant", content: "正在写" })
    expect(screen.getByTestId("loading").textContent).toBe("true")

    await act(async () => {
      api.abort()
    })

    expect(screen.getByTestId("loading").textContent).toBe("false")
    expect(screen.getByTestId("streaming").textContent).toBe("false")
  })

  it("旧流收尾不清掉新流的停止句柄", async () => {
    // 每次 send 的流各自可控：记录 handlers 与 signal，并允许单独收尾。
    const streams: {
      signal: AbortSignal
      finish(): void
    }[] = []
    streamChatMock.mockImplementation((_body: unknown, _h: unknown, sig: AbortSignal) => {
      let finish!: () => void
      const promise = new Promise<void>((resolve) => {
        finish = resolve
      })
      streams.push({ signal: sig, finish: () => act(() => finish()) })
      return promise
    })

    let api!: ReturnType<typeof useAgentStream>
    render(<Probe onReady={(a) => (api = a)} />)

    await act(async () => {
      void api.send("第一条", "thread-A")
    })
    await act(async () => {
      void api.send("第二条", "thread-A")
    })
    expect(streams).toHaveLength(2)

    // 旧流收尾：新流还在跑，不能把 isStreaming 抹掉、也不能清掉新流的句柄
    await act(async () => {
      streams[0].finish()
    })
    expect(screen.getByTestId("streaming").textContent).toBe("true")

    await act(async () => {
      api.abort()
    })
    expect(streams[1].signal.aborted).toBe(true)
  })

  it("工具调用后前一条 assistant 不再是流式态（不永久闪烁）", async () => {
    const stream = fakeStream()
    let api!: ReturnType<typeof useAgentStream>
    render(<Probe onReady={(a) => (api = a)} />)

    await act(async () => {
      void api.send("查一下", "thread-A")
    })
    stream.emit({ messageType: "assistant", content: "我先查一下知识库" })
    stream.emit({
      messageType: "tool-request",
      content: "",
      toolCalls: [{ name: "searchDocuments", arguments: "{}" }],
    })

    expect(screen.getByTestId("loading").textContent).toBe("false")
  })
})
