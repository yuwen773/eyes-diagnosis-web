// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { ApiError } from "@/lib/api"
import { RecordsPage } from "./RecordsPage"

vi.mock("@/lib/session", () => ({
  useSession: () => ({
    status: "anon",
    user: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return {
    ...actual,
    listMyDiagnoses: vi.fn(),
    getMyStats: vi.fn(),
  }
})

import { getMyStats, listMyDiagnoses } from "@/lib/api"

afterEach(() => {
  cleanup()
})

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

function renderPage() {
  stubMatchMedia()
  render(
    <ThemeProvider>
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe("RecordsPage 统计口径", () => {
  it("服务端聚合未上线时，三项计数标注「本页」", async () => {
    vi.mocked(listMyDiagnoses).mockResolvedValue({ records: [], total: 0 })
    vi.mocked(getMyStats).mockRejectedValue(new ApiError(404, "服务返回 404"))

    renderPage()

    expect(await screen.findByText("本页高风险 · SEVERE")).toBeTruthy()
  })

  it("服务端聚合可用时使用全量口径", async () => {
    vi.mocked(listMyDiagnoses).mockResolvedValue({ records: [], total: 0 })
    vi.mocked(getMyStats).mockResolvedValue({
      total: 128,
      highRisk: 9,
      awaitingReview: 12,
      lastReadAt: null,
    })

    renderPage()

    expect(await screen.findByText("高风险 · SEVERE")).toBeTruthy()
    expect(screen.queryByText("本页高风险 · SEVERE")).toBeNull()
  })
})
