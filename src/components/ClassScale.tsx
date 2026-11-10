import type { RankedClass } from "@/lib/domain"
import { confidencePercent } from "@/lib/domain"
import { useInView } from "@/lib/useInView"

/** 八类概率：一条带刻度的横尺，而不是圆角进度条。 */
export function ClassScale({
  rows,
  compact = false,
}: {
  rows: RankedClass[]
  compact?: boolean
}) {
  const [ref, inView] = useInView<HTMLDivElement>()

  if (rows.length === 0) {
    return <p className="small">本次判读未返回概率分布。</p>
  }

  return (
    <div
      ref={ref}
      className={compact ? "scale scale--compact" : "scale"}
      role="table"
      aria-label="八类判读概率"
    >
      {rows.map((row, index) => (
        <div
          key={`${row.code}-${row.name}`}
          className="scale__row"
          data-top={row.top}
          data-benign={row.benign}
          role="row"
        >
          <span className="scale__code" role="cell">
            {row.code}
          </span>
          <span className="scale__name" role="cell">
            {row.name}
          </span>
          <span className="scale__pct" role="cell">
            {confidencePercent(row.probability)}
          </span>
          <span className="scale__track" role="cell" aria-hidden="true">
            <span className="scale__ticks">
              {Array.from({ length: 10 }, (_, tick) => (
                <i key={tick} />
              ))}
            </span>
            <span
              className="scale__fill"
              style={{
                width: inView ? `${Math.max(row.probability * 100, 0.6)}%` : 0,
                transitionDelay: `${index * 55}ms`,
              }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}
