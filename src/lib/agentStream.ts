/**
 * Agent SSE 流核心：事件 reducer（纯函数，可单测）+ React hook。
 *
 * 事件语义对齐后端 DiagnosisAgent：assistant 逐片累加、reasoning 独立累加、
 * tool-request/tool-response/tool-confirm 都截断累加回合。tool-confirm 是
 * 信息性终点卡——后端图中断后流即结束，没有确认回传端点。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { streamChat, type AgentStreamDTO, type HistoryMessageVO } from "./api"
import { extractResources, type AgentResources } from "./agentResources"

export type StreamMsgType =
  | "user"
  | "assistant"
  | "reasoning"
  | "tool-request"
  | "tool-response"
  | "confirm"

export type ToolCallArg = {
  name: string
  args: Record<string, unknown>
}

export type StreamMessage = {
  id: string
  type: StreamMsgType
  content: string
  /** 仅 assistant 流式进行中为 true。 */
  isLoading?: boolean
  toolName?: string
  toolCalls?: ToolCallArg[]
  time?: string
  images?: string[]
}

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

/** assistant 是否可继续累加：最后一条就是它且仍在流式中。 */
function lastAppendableAssistant(msgs: StreamMessage[]): StreamMessage | undefined {
  const last = msgs[msgs.length - 1]
  return last && last.type === "assistant" && last.isLoading ? last : undefined
}

/** reasoning 可续写条件：最后一条是 reasoning，且其后没有 assistant/tool 类消息截断回合。 */
function lastAppendableReasoning(msgs: StreamMessage[]): StreamMessage | undefined {
  const last = msgs[msgs.length - 1]
  return last && last.type === "reasoning" && !last.isLoading ? last : undefined
}

/** 清掉所有流式中的 assistant（回合结束或被截断时调用）。 */
export function clearAllLoading(msgs: StreamMessage[]): StreamMessage[] {
  if (!msgs.some((m) => m.isLoading)) return msgs
  return msgs.map((m) => (m.isLoading ? { ...m, isLoading: false } : m))
}

/**
 * 工具/确认类事件会截断此前的累加回合——此时把还在流式中的 assistant
 * 收尾（isLoading=false），否则它会永远带着闪烁光标、且按纯文本渲染。
 */
function truncate(msgs: StreamMessage[]): StreamMessage[] {
  return clearAllLoading(msgs)
}

/** SSE 事件 → 消息数组的纯 reducer。工具/确认类事件截断此前的累加回合。 */
export function applyStreamEvent(
  msgs: StreamMessage[],
  dto: AgentStreamDTO,
): StreamMessage[] {
  const type = (dto.messageType ?? "").toLowerCase()
  const content = dto.content ?? ""

  switch (type) {
    case "assistant": {
      const target = lastAppendableAssistant(msgs)
      if (target) {
        return [
          ...msgs.slice(0, -1),
          { ...target, content: target.content + content },
        ]
      }
      return [
        ...msgs,
        { id: newId(), type: "assistant", content, isLoading: true },
      ]
    }

    case "reasoning": {
      const target = lastAppendableReasoning(msgs)
      if (target) {
        return [
          ...msgs.slice(0, -1),
          { ...target, content: target.content + content },
        ]
      }
      return [...msgs, { id: newId(), type: "reasoning", content }]
    }

    case "tool-request": {
      const out = truncate(msgs)
      for (const tc of dto.toolCalls ?? []) {
        const name = tc.name || "工具"
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(tc.arguments || "{}")
        } catch {
          parsedArgs = { _raw: tc.arguments }
        }
        out.push({
          id: newId(),
          type: "tool-request",
          content: "",
          toolName: name,
          toolCalls: [{ name, args: parsedArgs }],
        })
      }
      return out
    }

    case "tool-response":
      return [
        ...truncate(msgs),
        {
          id: newId(),
          type: "tool-response",
          content,
          toolName: dto.toolName,
        },
      ]

    // 兼容后端 MessageType.TOOL_CONFIRM（序列化为 tool-confirm）
    // 与历史 mcp-confirm 事件名。两者都是图中断的终点卡。
    case "tool-confirm":
    case "mcp-confirm":
      return [...truncate(msgs), { id: newId(), type: "confirm", content }]

    default:
      return msgs
  }
}

/** "2026-11-08 10:00:00" 无时区；只取时分展示。 */
function formatTime(createdTime: string): string {
  const d = new Date(createdTime.replace(" ", "T"))
  if (Number.isNaN(d.getTime())) return ""
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** 历史消息 role/subType → 流消息类型。 */
export function mapHistoryMessage(m: HistoryMessageVO): StreamMessage {
  let type: StreamMsgType
  if (m.role === "USER") {
    type = "user"
  } else {
    switch (m.subType) {
      case "reasoning":
        type = "reasoning"
        break
      case "tool-call":
        type = "tool-request"
        break
      case "tool-result":
        type = "tool-response"
        break
      case "mcp-confirm":
      case "tool-confirm":
        type = "confirm"
        break
      default:
        type = "assistant"
    }
  }

  // 历史里的工具调用落库格式是「工具名: 参数 JSON」（DiagnosisAgent.java:168-173），
  // 不解析的话工具步骤只剩一行空白的 TOOL 标签。
  if (type === "tool-request") {
    const parsed = parseToolCallText(m.content)
    return {
      id: newId(),
      type,
      content: "",
      toolName: parsed?.name,
      toolCalls: parsed ? [parsed] : undefined,
      time: m.createdTime ? formatTime(m.createdTime) : "",
    }
  }

  return {
    id: newId(),
    type,
    content: m.content,
    // tool-result 在后端没有落库（saveToolResultMessage 无调用方），
    // 保留分支只为兼容存量数据；内容是工具输出，从中切名字没有意义。
    toolName: undefined,
    time: m.createdTime ? formatTime(m.createdTime) : "",
  }
}

/** 「工具名: 参数 JSON」→ { name, args }；解析不出时返回 null。 */
function parseToolCallText(content: string): ToolCallArg | null {
  const sep = content.indexOf(":")
  if (sep <= 0) return null
  const name = content.slice(0, sep).trim()
  const raw = content.slice(sep + 1).trim()
  if (!name) return null
  try {
    return { name, args: JSON.parse(raw || "{}") as Record<string, unknown> }
  } catch {
    return { name, args: { _raw: raw } }
  }
}

export function useAgentStream() {
  const [messages, setMessages] = useState<StreamMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [resources, setResources] = useState<AgentResources>({
    images: [],
    links: [],
  })
  // 句柄带令牌：旧流收尾时新流可能已经建立，不能按「当前句柄」一把清。
  const abortRef = useRef<{ token: number; controller: AbortController } | null>(null)
  const streamSeq = useRef(0)

  useEffect(
    () => () => {
      // StrictMode 双挂载安全：abort 未激活的 controller 是 no-op
      abortRef.current?.controller.abort()
      abortRef.current = null
    },
    [],
  )

  const send = useCallback(
    async (message: string, threadId: string, urls: string[] = []) => {
      setIsStreaming(true)
      const token = ++streamSeq.current
      const controller = new AbortController()
      abortRef.current = { token, controller }

      // 只操作自己这一流：晚到的旧流不得清掉新流的流式态与光标。
      const isCurrent = () => streamSeq.current === token
      const clearLoading = () => {
        if (!isCurrent()) return
        setMessages((prev) => clearAllLoading(prev))
      }

      try {
        await streamChat(
          {
            message,
            threadId,
            imageUrls: urls.length > 0 ? urls : undefined,
          },
          {
            onEvent(dto) {
              if (!isCurrent()) return
              setMessages((prev) => applyStreamEvent(prev, dto))
              if ((dto.messageType ?? "").toLowerCase() === "tool-response") {
                setResources((prev) => extractResources(dto.content ?? "", prev))
              }
            },
            onDone() {
              clearLoading()
            },
            onError(err) {
              clearLoading()
              throw err
            },
          },
          controller.signal,
        )
      } catch (e) {
        clearLoading()
        // 旧流的错误不得冒泡成新流的失败
        if (isCurrent()) throw e
      } finally {
        // abort 时 fetch-event-source 直接 resolve，不触发 onDone/onError，
        // 所以收尾必须放在 finally——否则被「停止」打断的回复永远带着光标。
        if (isCurrent()) {
          clearLoading()
          setIsStreaming(false)
          abortRef.current = null
        }
      }
    },
    [],
  )

  const abort = useCallback(() => {
    abortRef.current?.controller.abort()
    abortRef.current = null
    setIsStreaming(false)
  }, [])

  const pushUser = useCallback((msg: StreamMessage) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  /** 历史加载用：整表替换消息。 */
  const setMessagesAll = useCallback((msgs: StreamMessage[]) => {
    setMessages(msgs)
  }, [])

  const reset = useCallback(() => {
    // 切会话/新建会话必须先中断在途 SSE——否则旧回合的 token 会继续写进新会话
    abortRef.current?.controller.abort()
    abortRef.current = null
    setIsStreaming(false)
    setMessages([])
    setResources({ images: [], links: [] })
  }, [])

  return {
    messages,
    isStreaming,
    resources,
    send,
    abort,
    pushUser,
    setMessages: setMessagesAll,
    reset,
  }
}
