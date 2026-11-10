/**
 * Agent 当前会话 id 的本地持久化。
 *
 * 按用户分 key——同一台电脑上先后登录两个账号时，不能把 A 的会话
 * 当成 B 的恢复出来。匿名态用 `anon` 前缀单独一份。
 * 无痕模式下 localStorage 访问会抛，读写都按空值处理。
 */

/** 存储 key：`agent_current_thread_id:<userId|anon>`。 */
export function threadStorageKey(userId?: number | null): string {
  return `agent_current_thread_id:${userId ?? "anon"}`
}

export function loadThreadId(userId?: number | null): string {
  try {
    return localStorage.getItem(threadStorageKey(userId)) || ""
  } catch {
    return ""
  }
}

export function saveThreadId(userId: number | null | undefined, id: string): void {
  try {
    const key = threadStorageKey(userId)
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
  } catch {
    // 存不进去不影响本次会话内的使用
  }
}
