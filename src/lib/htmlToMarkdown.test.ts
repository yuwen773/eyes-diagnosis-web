// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { htmlToMarkdown } from "./htmlToMarkdown"
import { renderMarkdown } from "./markdown"

describe("htmlToMarkdown", () => {
  it("标题按层级转井号", () => {
    expect(htmlToMarkdown("<h2>一</h2><h3>二</h3><h4>三</h4>")).toBe("## 一\n\n### 二\n\n#### 三")
  })

  it("段落之间留空行", () => {
    expect(htmlToMarkdown("<p>甲</p><p>乙</p>")).toBe("甲\n\n乙")
  })

  it("加粗与斜体", () => {
    expect(htmlToMarkdown("<p><strong>粗</strong>与<em>斜</em></p>")).toBe("**粗**与*斜*")
  })

  it("链接与图片", () => {
    expect(htmlToMarkdown('<p><a href="https://x.test">文字</a><img src="/a.png" alt="图"></p>')).toBe(
      "[文字](https://x.test)![图](/a.png)",
    )
  })

  it("无序与有序列表", () => {
    expect(htmlToMarkdown("<ul><li>甲</li><li>乙</li></ul>")).toBe("- 甲\n- 乙")
    expect(htmlToMarkdown("<ol><li>甲</li><li>乙</li></ol>")).toBe("1. 甲\n2. 乙")
  })

  it("嵌套列表按缩进输出", () => {
    expect(htmlToMarkdown("<ul><li>甲<ul><li>甲一</li></ul></li></ul>")).toBe("- 甲\n  - 甲一")
  })

  it("引用、分隔线与换行", () => {
    expect(htmlToMarkdown("<blockquote><p>引</p></blockquote>")).toBe("> 引")
    expect(htmlToMarkdown("<p>甲</p><hr><p>乙</p>")).toBe("甲\n\n---\n\n乙")
    expect(htmlToMarkdown("<p>甲<br>乙</p>")).toBe("甲\n乙")
  })

  it("未知标签剥标签保留文本", () => {
    expect(htmlToMarkdown('<div><span class="x">甲</span>乙</div>')).toBe("甲乙")
  })

  it("解码 HTML 实体", () => {
    expect(htmlToMarkdown("<p>a &amp; b &lt; c</p>")).toBe("a & b < c")
  })

  it("代码块转为围栏", () => {
    expect(htmlToMarkdown("<pre><code>const a = 1</code></pre>")).toBe("```\nconst a = 1\n```")
  })
})

describe("保存链路", () => {
  it("Markdown 里手写的 HTML 被转义，不会变成可执行标签", () => {
    const saved = renderMarkdown(htmlToMarkdown("<p>正文</p>") + "\n\n<div>手写</div>")

    expect(saved).toContain("正文")
    expect(saved).toContain("&lt;div&gt;")
    expect(saved).not.toContain("<div>手写</div>")
  })
})
