import DOMPurify from "dompurify"

/**
 * 放行排版需要的标签与属性。
 *
 * 白名单里含 h1 / pre / code / table 一族：正文现在由 Markdown 渲染而来，
 * 这些结构是正文的一部分，剥掉等于把编辑部写的内容删了。
 * 外链一律新开并带 noopener，其余一律丢掉。
 */

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "blockquote",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "div",
]

const ALLOWED_ATTR = ["href", "src", "alt", "title", "class", "colspan", "rowspan", "start"]

let hooked = false

function ensureHook() {
  if (hooked) return
  hooked = true
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank")
      node.setAttribute("rel", "noopener noreferrer")
    }
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy")
    }
  })
}

export function sanitizeNewsHtml(html?: string): string {
  if (!html) return ""
  ensureHook()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  })
}
