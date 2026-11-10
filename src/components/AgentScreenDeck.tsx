import { useState } from "react"
import CardSwap, { Card } from "@/components/CardSwap"
import { useMediaQuery } from "@/lib/useMediaQuery"

const SCREENS = [
  { name: "欢迎屏", en: "WELCOME" },
  { name: "影像分析", en: "TOOL CALL" },
  { name: "知识库检索", en: "RETRIEVAL" },
  { name: "结论与免责", en: "ANSWER" },
]

const HINTS = ["上传眼底图像", "描述症状", "了解眼病"]

/**
 * 叠在右侧的四块 Agent 界面：欢迎、影像分析回执、知识库命中、结论与免责。
 * 全部是演示数据，不调接口；排版与真实 AgentPage 同构（mono 标签 + 发丝线）。
 */
export function AgentScreenDeck({ dark }: { dark: boolean }) {
  const [front, setFront] = useState(0)
  // 窄屏收一档参数：扇面别铺得太开，否则卡片被缩得太小、字看不清
  const compact = useMediaQuery("(max-width: 860px)")

  return (
    <div className="deck">
      <div className="deck__stage">
        <CardSwap
          width={compact ? 400 : 640}
          height={compact ? 380 : 460}
          cardDistance={compact ? 26 : 34}
          verticalDistance={compact ? 38 : 44}
          depth={compact ? 60 : 70}
          skewAmount={compact ? 4 : 5}
          visibleCards={compact ? 3 : 4}
          delay={4600}
          cardRadius={compact ? 16 : 22}
          parallax={0.4}
          hoverSpread={0.12}
          theme={dark ? "dark" : "light"}
          label="诊断 Agent 界面示例"
          onChange={setFront}
        >
          <Card>
            <div className="screen screen--welcome">
              <header className="screen__head">
                <span className="screen__kicker num">01 · 欢迎屏</span>
                <span className="screen__meta num">{SCREENS[0].en}</span>
              </header>
              <div className="screen__body screen__body--center">
                <svg
                  className="screen__eye"
                  width="56"
                  height="56"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M1.8 12s3.6-6.2 10.2-6.2S22.2 12 22.2 12s-3.6 6.2-10.2 6.2S1.8 12 1.8 12Z" />
                  <circle cx="12" cy="12" r="2.9" />
                  <path d="M12 2.4v1.5M12 20.1v1.5M2.4 12h1.5M20.1 12h1.5" />
                </svg>
                <p className="screen__title">眼科诊断助手</p>
                <p className="screen__sub">描述症状，或上传一张眼底照片</p>
                <ul className="screen__hints">
                  {HINTS.map((hint) => (
                    <li key={hint} className="screen__hint">
                      {hint}
                    </li>
                  ))}
                </ul>
              </div>
              <footer className="screen__foot num">
                8 类眼底改变 · 质量门 · 人工复核
              </footer>
            </div>
          </Card>

          <Card>
            <div className="screen">
              <header className="screen__head">
                <span className="screen__kicker num">02 · 影像分析</span>
                <span className="screen__meta num">{SCREENS[1].en}</span>
              </header>
              <div className="screen__body">
                <div className="msg">
                  <span className="msg__role num">USER</span>
                  <p className="msg__text">
                    右眼这两周看东西发暗，这张是上周拍的眼底照。
                  </p>
                  <span className="chip num">fundus_od.jpg · 2.1 MB</span>
                </div>
                <div className="msg msg--tool">
                  <div className="msg__call">
                    <span className="msg__tool num">analyzeEyeImage</span>
                    <span className="msg__args num">← fundus_od.jpg</span>
                  </div>
                  <dl className="kv">
                    {/* 窄屏卡片矮一档，省掉一行说明文字，别让内容被裁掉 */}
                    {!compact && (
                      <div className="kv__row">
                        <dt>图像类型</dt>
                        <dd>彩色眼底照片</dd>
                      </div>
                    )}
                    <div className="kv__row">
                      <dt>影像质量</dt>
                      <dd className="num">86 / 100</dd>
                    </div>
                    <div className="kv__row">
                      <dt>关键特征</dt>
                      <dd>颞侧血管弓散在点状出血</dd>
                    </div>
                  </dl>
                </div>
              </div>
              <footer className="screen__foot num">TOOL 回执 · 1.4s · 可展开原始返回</footer>
            </div>
          </Card>

          <Card>
            <div className="screen">
              <header className="screen__head">
                <span className="screen__kicker num">03 · 知识库检索</span>
                <span className="screen__meta num">{SCREENS[2].en}</span>
              </header>
              <div className="screen__body">
                <div className="msg msg--tool">
                  <div className="msg__call">
                    <span className="msg__tool num">searchDocuments</span>
                    <span className="msg__args num">← DR · 点状出血 · 分期</span>
                  </div>
                  <ul className="hits">
                    <li className="hits__row">
                      <span className="hits__rank num">01</span>
                      <span className="hits__title">眼底影像判读规范 · 4.2</span>
                      <span className="hits__score num">0.92</span>
                    </li>
                    <li className="hits__row">
                      <span className="hits__rank num">02</span>
                      <span className="hits__title">DR 筛查与随访指南</span>
                      <span className="hits__score num">0.87</span>
                    </li>
                    <li className="hits__row">
                      <span className="hits__rank num">03</span>
                      <span className="hits__title">糖尿病视网膜病变分期</span>
                      <span className="hits__score num">0.81</span>
                    </li>
                  </ul>
                  {!compact && (
                    <blockquote className="quote">
                      「点状出血与硬性渗出沿颞侧血管弓分布，黄斑中心凹是否受累决定分期与随访间隔。」
                    </blockquote>
                  )}
                </div>
              </div>
              <footer className="screen__foot num">命中 3 段 · 已按相关度重排</footer>
            </div>
          </Card>

          <Card>
            <div className="screen">
              <header className="screen__head">
                <span className="screen__kicker num">04 · 结论与免责</span>
                <span className="screen__meta num">{SCREENS[3].en}</span>
              </header>
              <div className="screen__body">
                <div className="msg msg--agent">
                  <span className="msg__role num">AGENT</span>
                  <p className="msg__text">
                    颞侧血管弓附近有散在点状出血，黄斑中心凹尚未受累。结合「看东西发暗」，
                    需要把糖尿病视网膜病变放在前面考虑——但单张照片不能确诊。
                    建议 3 个月内复查眼底，并同步复核糖化血红蛋白与血压控制情况。
                  </p>
                  <p className="msg__note">
                    以上为参考建议，不构成诊断；如视力骤降或黑影突然增多，请尽快到眼科门诊。
                  </p>
                </div>
              </div>
              <footer className="screen__foot num">复核 PENDING · MODEL v2.4.0</footer>
            </div>
          </Card>
        </CardSwap>
      </div>

      <div className="deck__caption">
        <span className="deck__index num">
          {String(front + 1).padStart(2, "0")} / 04
        </span>
        <span className="deck__name">{SCREENS[front]?.name ?? SCREENS[0].name}</span>
        <span className="deck__hint num">拖动或点击切换 · DRAG</span>
      </div>
    </div>
  )
}

export default AgentScreenDeck
