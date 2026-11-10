// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Modal } from "./Modal"

afterEach(() => {
  cleanup()
})

function setup() {
  render(
    <Modal
      open
      title="人工复核"
      onClose={() => {}}
      footer={
        <>
          <button type="button">取消</button>
          <button type="button">确定</button>
        </>
      }
    >
      <p>结论</p>
    </Modal>,
  )
  return {
    close: screen.getByRole("button", { name: "关闭" }),
    confirm: screen.getByRole("button", { name: "确定" }),
  }
}

describe("Modal 焦点陷阱", () => {
  it("Tab 从最后一个可聚焦元素回到第一个", () => {
    const { close, confirm } = setup()
    confirm.focus()
    expect(document.activeElement).toBe(confirm)

    fireEvent.keyDown(document, { key: "Tab" })

    expect(document.activeElement).toBe(close)
  })

  it("Shift+Tab 从第一个回到最后一个", () => {
    const { close, confirm } = setup()
    close.focus()

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })

    expect(document.activeElement).toBe(confirm)
  })
})
