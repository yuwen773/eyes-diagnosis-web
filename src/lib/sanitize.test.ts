// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { renderNewsHtml } from "./markdown"
import { sanitizeNewsHtml } from "./sanitize"

describe("资讯正文：Markdown 渲染后经净化仍保留结构", () => {
  it("一级标题保留为标题", () => {
    expect(renderNewsHtml("# 一级标题")).toContain("<h1")
  })

  it("代码块保留 pre/code 结构", () => {
    const html = renderNewsHtml("```js\nconst a = 1\n```")
    expect(html).toContain("<pre")
    expect(html).toContain("<code")
  })

  it("表格保留 table 结构", () => {
    const html = renderNewsHtml("| a | b |\n| --- | --- |\n| 1 | 2 |")
    expect(html).toContain("<table")
  })

  it("脚本仍然被剥掉", () => {
    expect(sanitizeNewsHtml("<p>正文</p><script>alert(1)</script>")).not.toContain("<script")
  })

  it("编辑页预览与公开页同一条管线：所见即所存", () => {
    const source = "# 标题\n\n正文一段。\n\n```js\nconst a = 1\n```"
    // 预览渲染的那份 HTML，经公开页再净化一次不变——存进去的和显示的是同一份。
    expect(sanitizeNewsHtml(renderNewsHtml(source))).toBe(renderNewsHtml(source))
  })

  it("代码块里的复制按钮不作为正文残留", () => {
    expect(renderNewsHtml("```js\nconst a = 1\n```")).not.toContain("复制")
  })
})
