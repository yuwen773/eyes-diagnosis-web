import { describe, expect, it } from "vitest"
import {
  confidenceBand,
  confidencePercent,
  isUrgentAdvice,
  normalizeConfidence,
} from "./domain"

describe("normalizeConfidence", () => {
  it("0–1 的概率原样返回", () => {
    expect(normalizeConfidence(0.78)).toBeCloseTo(0.78)
  })

  it("0–100 的百分数除以 100", () => {
    expect(normalizeConfidence(78)).toBeCloseTo(0.78)
  })

  it("缺省与 NaN 读作 0（没有结论时不要抛）", () => {
    expect(normalizeConfidence(undefined)).toBe(0)
    expect(normalizeConfidence(null)).toBe(0)
    expect(normalizeConfidence(NaN)).toBe(0)
  })

  it("越界值夹紧到 0–1", () => {
    expect(normalizeConfidence(-3)).toBe(0)
    expect(normalizeConfidence(250)).toBe(1)
  })
})

describe("confidencePercent", () => {
  it("两种量纲读同一个数——这是全站唯一的置信度口径", () => {
    expect(confidencePercent(0.78)).toBe("78.0%")
    expect(confidencePercent(78)).toBe("78.0%")
  })

  it("没有结论显示破折号，不显示 0.0%", () => {
    expect(confidencePercent(undefined)).toBe("—")
    expect(confidencePercent(null)).toBe("—")
    expect(confidencePercent(NaN)).toBe("—")
  })

  it("0 是一个结论，不是缺失", () => {
    expect(confidencePercent(0)).toBe("0.0%")
  })
})

describe("confidenceBand", () => {
  it("三档不折叠：0.40 与 0.65 不是同一个标签", () => {
    expect(confidenceBand(0.9).label).toBe("可信")
    expect(confidenceBand(0.65).label).toBe("偏低")
    expect(confidenceBand(0.4).label).toBe("低")
  })

  it("边界值落在较高一档", () => {
    expect(confidenceBand(0.75).label).toBe("可信")
    expect(confidenceBand(0.6).label).toBe("偏低")
  })

  it("百分数量纲也分对档", () => {
    expect(confidenceBand(90).label).toBe("可信")
    expect(confidenceBand(65).label).toBe("偏低")
    expect(confidenceBand(40).label).toBe("低")
  })

  it("档位带风险色，低置信不是「正常」", () => {
    expect(confidenceBand(0.9).risk).toBe("normal")
    expect(confidenceBand(0.65).risk).toBe("attention")
    expect(confidenceBand(0.4).risk).toBe("critical")
  })

  it("缺失读作未评估，不猜", () => {
    expect(confidenceBand(undefined)).toEqual({ label: "未评估", risk: "unknown" })
    expect(confidenceBand(null)).toEqual({ label: "未评估", risk: "unknown" })
    expect(confidenceBand(NaN)).toEqual({ label: "未评估", risk: "unknown" })
  })
})

describe("isUrgentAdvice", () => {
  it("急性表现算急症", () => {
    expect(isUrgentAdvice("如视力骤降请立即就医")).toBe(true)
    expect(isUrgentAdvice("出现飞蚊骤增要尽快就医")).toBe(true)
    expect(isUrgentAdvice("视野缺损请前往急诊")).toBe(true)
  })

  it("泛化建议不算急症——标红一旦泛滥就等于没标", () => {
    expect(isUrgentAdvice("注意用眼休息")).toBe(false)
    expect(isUrgentAdvice("建议定期复查")).toBe(false)
    expect(isUrgentAdvice("控制血糖与血压")).toBe(false)
    expect(isUrgentAdvice("视力下降")).toBe(false)
  })
})
