// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { ThemeProvider } from "./theme-provider"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("ThemeProvider", () => {
  it("localStorage 不可用时照常渲染（无痕模式不白屏）", () => {
    // jsdom 没有 matchMedia——主题探测要用。
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied")
    })

    render(
      <ThemeProvider>
        <p>应用内容</p>
      </ThemeProvider>,
    )

    expect(screen.getByText("应用内容")).toBeTruthy()
  })
})
