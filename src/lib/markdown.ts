import MarkdownIt from "markdown-it"
import hljs from "highlight.js"
import { sanitizeNewsHtml } from "./sanitize"

// 图表代码块语言列表
export const DIAGRAM_LANGUAGES = ["mermaid", "drawio", "plantuml"]

// 创建 markdown-it 实例，启用 GFM
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: function (str: string, lang: string): string {
    // 图表语言不做语法高亮，保持原始内容供前端渲染
    if (lang && DIAGRAM_LANGUAGES.includes(lang.toLowerCase())) {
      return `<pre class="hljs code-block diagram-block" data-lang="${lang}"><div class="code-header"><span class="code-lang">${lang}</span><button class="copy-btn" data-code>复制</button></div><code>${md.utils.escapeHtml(str)}</code></pre>`
    }

    // 如果有语言标识，使用 highlight.js 高亮
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs code-block"><div class="code-header"><span class="code-lang">' +
          lang +
          '</span><button class="copy-btn" data-code>复制</button></div><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          "</code></pre>"
        )
      } catch (e) {
        void e
      }
    }
    // 否则返回普通代码块
    return (
      '<pre class="hljs code-block"><div class="code-header"><span class="code-lang">code</span><button class="copy-btn" data-code>复制</button></div><code>' +
      md.utils.escapeHtml(str) +
      "</code></pre>"
    )
  },
})

export function renderMarkdown(content: string): string {
  if (!content) return ""
  return md.render(content)
}

/**
 * 资讯用的渲染器：不做语法高亮与「复制」按钮那套仪器外壳——
 * 公开页的净化白名单里没有 button，正文里留下一个死按钮比没有更糟。
 * 结构（标题、代码块、表格）与正文一致，净化后仍然成立。
 */
const mdNews = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
})

/**
 * 资讯正文：编辑页预览、落库内容、公开页显示走同一条管线。
 * 公开页还会再净化一次（后端存的也可能是旧 HTML），净化是幂等的。
 */
export function renderNewsHtml(content: string): string {
  if (!content) return ""
  return sanitizeNewsHtml(mdNews.render(content))
}
