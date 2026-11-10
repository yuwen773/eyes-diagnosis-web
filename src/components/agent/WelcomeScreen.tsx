/**
 * 欢迎屏：排版一比一复刻 Vue 版 AgentMessageList 的 welcome 区
 * （眼睛视觉 + 标题 + 描述 + 三张引导卡），主题令牌换成 web/ 这套。
 *
 * 与 Vue 版的刻意差异（各有一条理由）：
 * - 神经脉冲/粒子不做成动画：项目规则「AI 装饰零容忍」，保留构图做静态线稿。
 * - 标题不用品牌色大字：web/ 的语言是 serif 标题 + 发丝线，不铺强调色。
 */
const HINTS = [
  {
    icon: "image" as const,
    title: "上传眼底图像",
    desc: "发送眼底图片，AI 辅助分析",
    // 模型只认彩色眼底照片（JPEG/PNG）。OCT 是另一种成像，模型不在它的范围内，
    // 把 OCT 写进引导语等于 inviting 用户上传一张注定读不出来的东西。
    action: "上传我的眼底照片",
    prompt: "帮我解读这张眼底照片",
  },
  {
    icon: "text" as const,
    title: "描述症状",
    desc: "用文字描述眼部不适",
    action: "我最近眼睛干涩、偶尔模糊是怎么回事",
    prompt: "我最近眼睛干涩、偶尔模糊是怎么回事",
  },
  {
    icon: "learn" as const,
    title: "了解眼病",
    desc: "查询眼科疾病知识",
    action: "介绍一下白内障的症状和预防",
    prompt: "介绍一下白内障的症状和预防",
  },
]

function GuideIcon({ icon }: { icon: "image" | "text" | "learn" }) {
  if (icon === "image") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    )
  }
  if (icon === "text") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

export function WelcomeScreen({ onSend }: { onSend: (text: string) => void }) {
  return (
    <div className="welcome">
      {/* 主舞台：排版同 Vue 版 welcome-stage */}
      <div className="welcome-stage">
        {/* 眼睛视觉：同 Vue 版 eye-vision 构图；脉冲/粒子取静态（装饰零容忍） */}
        <div className="eye-vision" aria-hidden="true">
          <svg className="ev-svg" viewBox="0 0 240 200" fill="none">
            {/* 外层神经网络连线（Vue 版是脉冲动画，此处静态） */}
            <line x1="120" y1="100" x2="60" y2="50" className="ev-pulse" />
            <line x1="120" y1="100" x2="180" y2="50" className="ev-pulse" />
            <line x1="120" y1="100" x2="30" y2="100" className="ev-pulse" />
            <line x1="120" y1="100" x2="210" y2="100" className="ev-pulse" />
            <line x1="120" y1="100" x2="60" y2="150" className="ev-pulse" />
            <line x1="120" y1="100" x2="180" y2="150" className="ev-pulse" />
            <line x1="60" y1="50" x2="30" y2="100" className="ev-pulse ev-sub" />
            <line x1="180" y1="50" x2="210" y2="100" className="ev-pulse ev-sub" />
            <line x1="30" y1="100" x2="60" y2="150" className="ev-pulse ev-sub" />
            <line x1="210" y1="100" x2="180" y2="150" className="ev-pulse ev-sub" />

            {/* 神经节点 */}
            <circle cx="60" cy="50" r="4" className="ev-node" />
            <circle cx="180" cy="50" r="4" className="ev-node" />
            <circle cx="30" cy="100" r="3.5" className="ev-node" />
            <circle cx="210" cy="100" r="3.5" className="ev-node" />
            <circle cx="60" cy="150" r="4" className="ev-node" />
            <circle cx="180" cy="150" r="4" className="ev-node" />
            <circle cx="120" cy="100" r="6" className="ev-core-node" />

            {/* 眼睛轮廓 */}
            <path
              d="M20 100C20 100 60 50 120 50C180 50 220 100 220 100C220 100 180 150 120 150C60 150 20 100 20 100Z"
              className="ev-eye"
            />
            {/* 眼睛内圈 */}
            <circle cx="120" cy="100" r="28" className="ev-iris-ring" />
            <circle cx="120" cy="100" r="20" className="ev-iris-ring ev-iris-inner" />
            {/* 瞳孔内核 */}
            <circle cx="120" cy="100" r="10" className="ev-pupil" />
            <circle cx="124" cy="96" r="2.5" className="ev-light" />
          </svg>
        </div>

        <div className="welcome-text">
          <h2 className="welcome-title">Iris</h2>
          <p className="welcome-desc">上传眼底图片或描述症状，我来帮你理解影像与检查结果</p>
        </div>

        <div className="welcome-hints">
          {HINTS.map((h) => (
            <button
              key={h.title}
              type="button"
              className="guide-card"
              onClick={() => onSend(h.prompt)}
            >
              <div className="guide-icon-wrap">
                <GuideIcon icon={h.icon} />
              </div>
              <div className="guide-content">
                <span className="guide-title">{h.title}</span>
                <span className="guide-desc">{h.desc}</span>
              </div>
              <div className="guide-action">
                <span className="guide-action-text">{h.action}</span>
                <svg className="guide-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
