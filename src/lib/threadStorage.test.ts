// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadThreadId, saveThreadId, threadStorageKey } from "./threadStorage"

describe("threadStorage", () => {
  beforeEach(() => localStorage.clear())

  it("不同用户各存各的", () => {
    saveThreadId(1, "a")
    saveThreadId(2, "b")
    expect(loadThreadId(1)).toBe("a")
    expect(loadThreadId(2)).toBe("b")
  })

  it("匿名态单独一份", () => {
    saveThreadId(null, "anon-thread")
    expect(loadThreadId(null)).toBe("anon-thread")
    expect(loadThreadId(1)).toBe("")
  })

  it("保存空串等于清除", () => {
    saveThreadId(1, "a")
    saveThreadId(1, "")
    expect(loadThreadId(1)).toBe("")
  })

  it("key 带用户 id 前缀", () => {
    expect(threadStorageKey(7)).toBe("agent_current_thread_id:7")
    expect(threadStorageKey(null)).toBe("agent_current_thread_id:anon")
  })

  it("localStorage 抛错时按空值处理，不崩页面", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    expect(loadThreadId(1)).toBe("")
    spy.mockRestore()
  })
})
