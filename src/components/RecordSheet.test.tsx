// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { DiagnosisResult } from "@/lib/api"
import { RecordSheet } from "./RecordSheet"

afterEach(() => {
  cleanup()
})

describe("RecordSheet 人工复核结论", () => {
  it("有复核结论时同时展示 AI 初判与人工结论", () => {
    const result = {
      result: "糖尿病视网膜病变",
      humanResult: "复核：中度非增殖期，建议 6 个月复查",
      humanSeverity: "MODERATE",
      humanRecommendations: "控制血糖\n6 个月后复查",
      humanReviewStatus: "APPROVED",
    } as DiagnosisResult

    render(<RecordSheet result={result} />)

    expect(screen.getByText(/AI 判读结果/)).toBeTruthy()
    expect(screen.getByText("复核：中度非增殖期，建议 6 个月复查")).toBeTruthy()
    expect(screen.getByText("人工复核结论 · HUMAN REVIEW")).toBeTruthy()
    expect(screen.getByText("控制血糖")).toBeTruthy()
  })

  it("没有复核结论时不渲染该区块", () => {
    render(<RecordSheet result={{ result: "正常" } as DiagnosisResult} />)

    expect(screen.queryByText(/人工复核结论/)).toBeNull()
  })
})
