// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ChatInput } from "@/components/agent/ChatInput"

afterEach(() => {
  cleanup()
  // 草稿存 sessionStorage——不清会把上一个用例打的字带进下一个用例
  sessionStorage.clear()
})

function setup(streaming: boolean, sent = true) {
  const onSend = vi.fn().mockResolvedValue(sent)
  const onStop = vi.fn()
  render(
    <ChatInput
      disabled={false}
      streaming={streaming}
      onSend={onSend}
      onStop={onStop}
    />,
  )
  return { onSend, onStop, textarea: screen.getByPlaceholderText(/Enter 发送/) as HTMLTextAreaElement }
}

describe("ChatInput", () => {
  it("流式期间按 Enter 不发送、也不清空已输入的文字", () => {
    const { onSend, textarea } = setup(true)
    fireEvent.change(textarea, { target: { value: "追问一句" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    expect(onSend).not.toHaveBeenCalled()
    expect((textarea as HTMLTextAreaElement).value).toBe("追问一句")
  })

  it("非流式时 Enter 发送并清空", async () => {
    const { onSend, textarea } = setup(false)
    fireEvent.change(textarea, { target: { value: "你好" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    await waitFor(() => expect(textarea.value).toBe(""))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0][0]).toBe("你好")
  })

  it("发送失败时保留文字与附件，草稿不清", async () => {
    const { onSend, textarea } = setup(false, false)
    fireEvent.change(textarea, { target: { value: "别丢我" } })
    fireEvent.keyDown(textarea, { key: "Enter" })

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(textarea.value).toBe("别丢我")
    expect(screen.getByText("发送没成功，内容已保留，可以重试")).toBeTruthy()
  })

  it("中文输入法组字中的 Enter 不发送", () => {
    const { onSend, textarea } = setup(false)
    fireEvent.change(textarea, { target: { value: "你好" } })
    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true })

    expect(onSend).not.toHaveBeenCalled()
    expect(textarea.value).toBe("你好")
  })

  it("流式期间显示的是停止按钮", () => {
    const { onStop } = setup(true)
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }))
    expect(onStop).toHaveBeenCalled()
  })
})
