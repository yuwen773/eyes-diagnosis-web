import type { ReactNode } from "react"
import type { DiagnosisResult } from "@/lib/api"
import { ClassScale } from "@/components/ClassScale"
import { ConfidenceDial } from "@/components/ConfidenceDial"
import { RiskTag } from "@/components/RiskTag"
import {
  classCode,
  confidenceBand,
  confidencePercent,
  formatTimestamp,
  normalizeConfidence,
  rankClasses,
  recommendationLines,
  reviewState,
  severityLabel,
  severityRisk,
  shortHash,
  TRIAGE_FALLBACK,
  isUrgentAdvice,
} from "@/lib/domain"

type RecordSheetProps = {
  result: DiagnosisResult
  recordId?: string
  actions?: ReactNode
  /** 示例记录不展示操作区。 */
  specimen?: boolean
  /** 本次判读的原始影像。有则作为证据栏出现在记录纸左侧。 */
  imageSrc?: string
  /** 皮肤：paper = 纸面（判读页，需 .is-sheet 钉回纸色）；night = 暗房仪器面板（落地页）。 */
  tone?: "paper" | "night"
}

/**
 * 判读记录：整站唯一的报告呈现。
 * paper 皮肤在纸面上下文（.is-sheet）使用；night 皮肤消费暗房反转令牌。
 */
export function RecordSheet({ result, recordId, actions, specimen = false, imageSrc, tone = "paper" }: RecordSheetProps) {
  const rejected = Boolean(result.aiRejected)
  const rows = rankClasses(result)
  const confidence = normalizeConfidence(result.confidence ?? result.probability)
  const band = confidenceBand(result.confidence ?? result.probability)
  const review = reviewState(result.humanReviewStatus)
  const recos = recommendationLines(result)
  const stampRisk = severityRisk(result.severity)

  return (
    <article className={tone === "night" ? "sheet sheet--night" : "sheet is-sheet"} data-cursor>
      <header className="sheet__head">
        <span className="sheet__id">
          判读记录 · READING RECORD
          {recordId ? ` · ${recordId}` : ""}
          {specimen ? " · 示例，非真实患者" : ""}
        </span>
        <span className="sheet__id">
          {result.modelVersion ? `${result.modelVersion} · ` : ""}
          {formatTimestamp(result.createTime)}
        </span>
      </header>

      {rejected ? (
        <div className="sheet__section" style={{ borderTop: 0 }}>
          <div className="notice" data-tone="critical">
            <span className="notice__mark">拒识</span>
            <div>
              <p className="notice__title">本次影像未形成判读结论</p>
              <p className="notice__body">
                {result.abstainReason
                  ? `系统判定影像不足以支持判读：${result.abstainReason}。`
                  : "系统判定影像不足以支持判读。"}
                请重新上传清晰的眼底照片，或申请人工复核。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="sheet__body">
            {imageSrc ? (
              <figure className="sheet__evidence">
                <img src={imageSrc} alt="本次判读的眼底照片" />
                <figcaption className="num">影像 · SOURCE</figcaption>
              </figure>
            ) : null}
            <div>
              <p className="overline sheet__verdict-kicker">
                AI 判读结果 · {classCode(result.result)}
              </p>
              <h2 className="sheet__verdict">{result.result ?? "未给出判读结果"}</h2>
              {result.details ? <p className="sheet__note">{result.details}</p> : null}

              <div className="sheet__facts">
                <div className="readout">
                  <span className="readout__label">置信度</span>
                  <span className="readout__value readout__value--mono">
                    {confidencePercent(confidence)}{" "}
                    <RiskTag risk={band.risk}>{band.label}</RiskTag>
                  </span>
                </div>
                <div className="readout">
                  <span className="readout__label">严重程度</span>
                  <span className="readout__value">
                    {severityLabel(result.severity)} ·{" "}
                    <RiskTag risk={stampRisk}>
                      {stampRisk === "normal"
                        ? "低"
                        : stampRisk === "attention"
                          ? "关注"
                          : stampRisk === "critical"
                            ? "高"
                            : "—"}
                    </RiskTag>
                  </span>
                </div>
                <div className="readout">
                  <span className="readout__label">人工复核</span>
                  <span className="readout__value">
                    <RiskTag risk={review.risk}>{review.label}</RiskTag>
                  </span>
                </div>
              </div>
            </div>

            <ConfidenceDial value={confidence} size={104} label="置信度" unit="CONF" />
          </div>

          <section className="sheet__section">
            <div className="sheet__section-head">
              <span className="overline">八类概率 · CLASS PROBABILITY</span>
              <span className="overline">0 — 100%</span>
            </div>
            <ClassScale rows={rows} />
          </section>

          {recos.length > 0 ? (
            <section className="sheet__section">
              <div className="sheet__section-head">
                <span className="overline">建议 · RECOMMENDATIONS</span>
              </div>
              <ol className="recos">
                {recos.map((line) => (
                  <li key={line} data-urgent={isUrgentAdvice(line) ? "true" : undefined}>
                    <span className="recos__body">
                      {isUrgentAdvice(line) ? (
                        <span className="recos__flag">急</span>
                      ) : null}
                      {line}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <section className="sheet__section">
              <div className="sheet__section-head">
                <span className="overline">建议 · RECOMMENDATIONS</span>
              </div>
              <div className="notice" data-tone="attention">
                <span className="notice__mark">提示</span>
                <div>
                  <p className="notice__title">本次判读未给出个体化建议</p>
                  <p className="notice__body">{TRIAGE_FALLBACK}</p>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {result.requiresReview && !rejected ? (
        <section className="sheet__section">
          <div className="notice" data-tone="attention">
            <span className="notice__mark">待复核</span>
            <div>
              <p className="notice__title">AI 初步判读待人工复核</p>
              <p className="notice__body">
                该记录已进入医生复核队列，签字前不得作为诊疗依据引用。
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="sheet__stamps">
        <div className="sheet__stamp">
          <div className="readout">
            <span className="readout__label">质量门</span>
            <span className="readout__value">
              {rejected ? (
                <RiskTag risk="critical">未通过</RiskTag>
              ) : (
                <span className="num">
                  {typeof result.qualityScore === "number"
                    ? `通过 · ${Math.round(result.qualityScore)}`
                    : "通过"}
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="sheet__stamp">
          <div className="readout">
            <span className="readout__label">人工复核</span>
            <span className="readout__value">
              <RiskTag risk={review.risk}>{review.label}</RiskTag>
            </span>
          </div>
        </div>
        <div className="sheet__stamp">
          <div className="readout">
            <span className="readout__label">模型</span>
            <span className="readout__value readout__value--mono">
              {result.modelVersion ?? "—"}
            </span>
          </div>
        </div>
        <div className="sheet__stamp">
          <div className="readout">
            <span className="readout__label">权重 SHA-256</span>
            <span className="readout__value readout__value--mono">
              {shortHash(result.weightSha256)}
            </span>
          </div>
        </div>
      </div>

      <div className="disclaimer">
        <p>
          {result.disclaimer ||
            "本记录由 AI 辅助判读生成，仅供参考，不构成诊断结论，不能替代执业医师的检查与判断。"}
          影像、模型版本与权重指纹随记录保存，可在复核时回放。
        </p>
      </div>

      {actions && !specimen ? <div className="sheet__actions no-print">{actions}</div> : null}
    </article>
  )
}
