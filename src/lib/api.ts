/**
 * 后端契约封装。端点与请求体与现有 Java 服务保持一致：
 * 统一返回 { code: 0, data, msg }，会话走 Spring Session Cookie。
 */

import { fetchEventSource } from "@microsoft/fetch-event-source"

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api"

/**
 * 未登录事件。业务接口回 40100 时广播，由路由层跳登录页（带回跳地址）。
 * 会话探测 getLoginUser 不广播——匿名访问是常态，不能把人一脚踢去登录。
 */
export const AUTH_EXPIRED_EVENT = "eye:auth-expired"

/** 事件负载：错误码。40100=未登录；40101=无权限（匿名访问会话时后端也用这个码）。 */
export type AuthExpiredDetail = { code: number }

function notifyAuthExpired(code: number) {
  window.dispatchEvent(
    new CustomEvent<AuthExpiredDetail>(AUTH_EXPIRED_EVENT, { detail: { code } }),
  )
}

export class ApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.code = code
  }
}

type Envelope<T> = {
  code?: number
  data?: T
  msg?: string
}

type RequestOptions = {
  /** 40100 不广播未登录事件（用于会话探测这类「匿名也是正常结果」的调用）。 */
  silentAuth?: boolean
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const isForm = init.body instanceof FormData
  let response: Response

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Accept: "application/json",
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(-1, "网络不可用，请检查连接后重试")
  }

  if (!response.ok) {
    throw new ApiError(response.status, `服务返回 ${response.status}`)
  }

  const payload = (await response.json()) as Envelope<T>
  if (payload.code !== 0) {
    if (payload.code === 40100 && !options.silentAuth) {
      notifyAuthExpired(40100)
    }
    throw new ApiError(payload.code ?? -1, payload.msg || "请求未完成")
  }

  return payload.data as T
}

/* ── 用户 ─────────────────────────────────────────────── */

export type LoginUser = {
  id?: number
  userAccount?: string
  userName?: string
  userAvatar?: string
  userProfile?: string
  userRole?: string
  createTime?: string
}

export function login(body: { userAccount: string; userPassword: string }) {
  return request<LoginUser>("/user/login", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function register(body: {
  userAccount: string
  userPassword: string
  checkPassword: string
}) {
  return request<number>("/user/register", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function getLoginUser() {
  // 匿名是正常结果，不触发跳登录
  return request<LoginUser>("/user/get/login", { method: "GET" }, { silentAuth: true })
}

export function logout() {
  // 登出时可能本来就没登录，同样不触发跳登录
  return request<boolean>("/user/logout", { method: "POST" }, { silentAuth: true })
}

/* ── 诊断 ─────────────────────────────────────────────── */

export type Disease = {
  name?: string
  probability?: number
}

export type DiagnosisResult = {
  id?: number
  url?: string
  result?: string
  probability?: number
  confidence?: number
  recommendations?: string
  details?: string
  severity?: string
  createTime?: string
  otherDisease?: Disease[]
  /* 负责任 AI 字段 */
  aiRejected?: boolean
  abstainReason?: string
  modelVersion?: string
  weightSha256?: string
  humanReviewStatus?: string
  humanResult?: string
  humanSeverity?: string
  humanRecommendations?: string
  humanReviewNote?: string
  disclaimer?: string
  requiresReview?: boolean
  qualityScore?: number
  qualityReasons?: string
  calibratedProbability?: number
  calibrationStatus?: string
  oodStatus?: string
  oodScore?: number
}

export type UploadedPicture = {
  id?: number
  url?: string
  status?: string
}

export function uploadPicture(file: File) {
  const form = new FormData()
  form.append("file", file)
  return request<UploadedPicture>("/diagnosis/upload", {
    method: "POST",
    body: form,
  })
}

export function runDiagnosis(file: File) {
  const form = new FormData()
  form.append("file", file)
  return request<DiagnosisResult>("/diagnosis/diagnosis", {
    method: "POST",
    body: form,
  })
}

/* ── 新闻资讯 ───────────────────────────────────────────── */

export type NewsItem = {
  /** 后端把 Long 序列化成字符串（雪花 id 超出 JS 安全整数）。 */
  id?: string | number
  title?: string
  author?: string
  avatar?: string | null
  /** 富文本 HTML。 */
  content?: string
  summary?: string
  coverImage?: string
  /** "YYYY-MM-DD HH:mm:ss"，无时区。 */
  publishTime?: string
}

export type NewsPage = {
  records?: NewsItem[]
  total?: number
  size?: number
  current?: number
  pages?: number
}

export type NewsQuery = {
  current?: number
  pageSize?: number
  /** 按标题模糊检索。 */
  title?: string
  sortField?: string
  sortOrder?: string
}

/** 资讯分页。默认按发布时间倒序——不传 sortField 时后端不排序，返回的是主键升序。 */
export function listNews(query: NewsQuery = {}) {
  return request<NewsPage>("/news/list/page/vo", {
    method: "POST",
    body: JSON.stringify({
      current: 1,
      pageSize: 9,
      sortField: "publishTime",
      sortOrder: "descend",
      ...query,
    }),
  })
}

export function getNews(id: string | number) {
  return request<NewsItem>(`/news/get/${id}`, { method: "GET" })
}

/* ── Agent 智能对话 ─────────────────────────────────────── */

export type AgentSessionVO = {
  sessionId: string
  title: string
  lastMessage: string
  messageCount: number
  summaryContent: string
  createdTime: string
  updatedTime: string
  isPinned?: boolean
}

export type HistoryMessageVO = {
  id: number
  role: string
  subType: string
  content: string
  isSummary: boolean
  createdTime: string
}

export type ChatHistoryVO = {
  messages: HistoryMessageVO[]
  hasMore: boolean
  nextCursor: number | null
}

export function getSessions(beforeId?: string, limit = 20) {
  let path = `/agent/sessions?limit=${limit}`
  if (beforeId) path += `&beforeId=${beforeId}`
  return request<AgentSessionVO[]>(path)
}

export function deleteSession(sessionId: string) {
  return request<boolean>(`/agent/sessions/${sessionId}`, { method: "DELETE" })
}

export function batchDeleteSessions(sessionIds: string[]) {
  return request<number>("/agent/sessions/batch", {
    method: "DELETE",
    body: JSON.stringify({ sessionIds }),
  })
}

export function updateSessionTitle(sessionId: string, title: string) {
  return request<boolean>(`/agent/sessions/${sessionId}/title`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  })
}

export function updatePinStatus(sessionId: string, pinned: boolean) {
  return request<boolean>(`/agent/sessions/${sessionId}/pin`, {
    method: "PUT",
    body: JSON.stringify({ pinned }),
  })
}

export function generateTitle(sessionId: string, firstMessage: string) {
  return request<boolean>(`/agent/sessions/${sessionId}/generate-title`, {
    method: "POST",
    body: JSON.stringify({ firstMessage }),
  })
}

export function getChatHistory(threadId: string, beforeId?: number, limit = 40) {
  let path = `/agent/history/${threadId}?limit=${limit}`
  if (beforeId) path += `&beforeId=${beforeId}`
  return request<ChatHistoryVO>(path)
}

export function exportSession(sessionId: string, format: "markdown" | "json") {
  return request<string>(`/agent/history/${sessionId}/export?format=${format}`)
}

export function uploadAgentImage(file: File) {
  const form = new FormData()
  form.append("file", file)
  return request<string>("/agent/image/upload", {
    method: "POST",
    body: form,
  })
}

export function deleteAgentImage(url: string) {
  return request<boolean>("/agent/image/upload/delete", {
    method: "POST",
    body: JSON.stringify({ url }),
  })
}

/* ── 用户中心：资料 / 头像 / 我的判读记录 ───────────────── */

export type UserVO = {
  /** 后端 JsonConfig 全局 Long→String，id 线上是字符串。 */
  id?: string | number
  userAccount?: string
  userName?: string
  userAvatar?: string
  userProfile?: string
  userRole?: string
  createTime?: string
}

/** 本人资料更新（/user/update/userCenter）。空字段后端按原值跳过。 */
export function updateProfile(body: {
  userName?: string
  userProfile?: string
}) {
  return request<boolean>("/user/update/userCenter", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

/** 头像上传。返回最新 UserVO；调用方负责随后刷新会话同步全站头像。 */
export function uploadAvatar(file: File) {
  const form = new FormData()
  form.append("file", file)
  return request<UserVO>("/user/upload/avatar", { method: "POST", body: form })
}

/**
 * 我的判读分页。行对象是 DiagnosisManageVO——列表接口不做详情级脱敏补全，
 * 人工复核结论等完整字段要点开走 /diagnosis/get/{id}。
 * AI 拒识的行 result/confidence/severity 是 null，不是 0。
 */
export type DiagnosisManage = {
  /** 雪花 id，线上是字符串。 */
  id: string
  url?: string
  username?: string
  result?: string | null
  confidence?: number | null
  severity?: string | null
  /** 1 未复审 / 2 复审中 / 3 已复审。 */
  reexamineStatus?: number
  createTime?: string
  status?: string
  aiRejected?: boolean
  abstainReason?: string
  requiresReview?: boolean
}

/**
 * 分页信封。计数字段线上是字符串（后端全局 Long→String），
 * 统一转回 number，分页算术才不会踩到 "13" 这种值。
 */
type RawPage<T> = {
  records?: T[]
  total?: number | string
  size?: number | string
  current?: number | string
  pages?: number | string
}

export type RecordPage<T> = {
  records?: T[]
  total?: number
  size?: number
  current?: number
  pages?: number
}

function toPage<T>(raw: RawPage<T>): RecordPage<T> {
  const num = (value?: number | string) =>
    value === undefined || value === null ? undefined : Number(value)
  return {
    records: raw.records,
    total: num(raw.total),
    size: num(raw.size),
    current: num(raw.current),
    pages: num(raw.pages),
  }
}

export function listMyDiagnoses(
  q: { current?: number; pageSize?: number; result?: string } = {},
) {
  return request<RawPage<DiagnosisManage>>("/diagnosis/list/page/my", {
    method: "POST",
    body: JSON.stringify({ current: 1, pageSize: 10, ...q }),
  }).then(toPage)
}

export type MyDiagnosisStats = {
  total: number
  highRisk: number
  awaitingReview: number
  lastReadAt: string | null
}

/** 服务端聚合。接口未上线时返回 404，调用方据此降级到当前页口径。 */
export function getMyStats() {
  return request<MyDiagnosisStats>("/diagnosis/stats/my", { method: "GET" })
}

/** 本人判读详情（后端做归属校验）。返回完整记录纸字段。 */
export function getMyDiagnosis(id: string | number) {
  return request<DiagnosisResult>(`/diagnosis/get/${id}`, { method: "GET" })
}

/**
 * 申请复诊。后端 DTO 无 @RequestBody，id 走 query；只允许本人记录，
 * 提交后 reexamineStatus 置为 2（复审中）。
 */
export function requestReexamine(id: string | number) {
  return request<boolean>(`/user/diagnosis/reexamine?id=${id}`, { method: "POST" })
}

/* ── Agent SSE 流 ──────────────────────────────────────── */

/** 后端 MessageDTO 的流事件载荷。messageType 序列化自枚举，大小写不保证。 */
export type AgentStreamDTO = {
  messageType: string
  content?: string
  toolCalls?: { name: string; arguments: string }[]
  toolName?: string
}

export type StreamChatHandlers = {
  onEvent(dto: AgentStreamDTO): void
  onDone(): void
  onError(err: unknown): void
}

/**
 * SSE 流式对话。不能走 request<T>——它解 JSON 信封，会破坏事件流。
 * 未收到 done 事件就断流（网络闪断、服务重启）时抛「连接中断」，
 * 调用方据此回滚本回合上传的图片。
 */
export async function streamChat(
  body: { message: string; threadId: string; imageUrls?: string[] },
  handlers: StreamChatHandlers,
  signal: AbortSignal,
): Promise<void> {
  let completed = false
  await fetchEventSource(`${BASE_URL}/agent/chat/stream`, {
    method: "POST",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    credentials: "include",
    openWhenHidden: true,

    async onopen(response) {
      if (!response.ok) {
        throw new ApiError(response.status, `服务返回 ${response.status}`)
      }
      // 匿名访问时后端抛 BusinessException(NO_AUTH_ERROR)，返回的是 200 + JSON 信封，
      // 而不是 SSE 流——把它当流读会一直等到超时。识别出来并转成未登录事件。
      const contentType = response.headers.get("content-type") ?? ""
      if (contentType.includes("application/json")) {
        const payload = (await response.json().catch(() => null)) as Envelope<unknown> | null
        const code = payload?.code ?? -1
        if (code === 40100 || code === 40101) {
          notifyAuthExpired(code)
        }
        throw new ApiError(code, payload?.msg || "对话服务拒绝了这次请求")
      }
    },

    onmessage(event) {
      if (event.event === "done") {
        completed = true
        return
      }
      if (event.event === "error") {
        throw new ApiError(-1, event.data || "对话服务出错")
      }
      if (!event.data) return
      let dto: AgentStreamDTO
      try {
        dto = JSON.parse(event.data) as AgentStreamDTO
      } catch (e) {
        // 单片解析失败不中断整条流
        console.error("SSE 数据解析失败", e)
        return
      }
      dto.messageType = (dto.messageType ?? "").toLowerCase()
      // 事件处理放在 try 外：handler 里的 setState updater 在渲染期才执行，
      // 包进 try 只会把它的异常误报成「数据解析失败」。
      handlers.onEvent(dto)
    },

    onclose() {
      if (!completed) {
        throw new ApiError(-1, "连接中断")
      }
      handlers.onDone()
    },

    onerror(err) {
      completed = false
      handlers.onError(err)
      throw err
    },
  })
}

export type ErrorDetail = {
  /** 机器可读的错误码：HTTP 状态码或后端业务码。 */
  code: number | null
  /** 给用户看的那句话——说清发生了什么、接下来怎么办。 */
  text: string
}

/**
 * 把传输层的错误翻成人话。
 *
 * 后端回的是错误码加一句技术描述（「服务返回 502」「请求数据不存在」）。
 * 页面要说的是另一回事：没读出来，还是没连上，还是这条已经不在了。
 */
export function describeError(cause: unknown): ErrorDetail {
  if (!(cause instanceof ApiError)) {
    return { code: null, text: "出了点意料之外的情况，这条内容没能读出来。" }
  }

  const { code } = cause
  if (code === -1) return { code, text: "连不上服务，请检查网络后再试一次。" }
  if (code === 40100) return { code, text: "这条内容需要登录后才能查看。" }
  if (code === 40101 || code === 40300) {
    return { code, text: "你没有查看这条内容的权限。" }
  }
  if (code === 40400 || code === 404) {
    return { code, text: "后端没有找到这条内容，它可能已经下架了。" }
  }
  if (code === 40000) return { code, text: "这次请求的条件不对，换个条件再试。" }
  if (code >= 500) {
    return { code, text: "服务这会儿没有响应，通常是临时的，过一会儿再试。" }
  }
  return { code, text: cause.message }
}
