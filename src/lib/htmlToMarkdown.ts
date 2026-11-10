/**
 * 旧版富文本（HTML）→ Markdown 的最小转换器。
 *
 * 只服务一个场景：编辑部打开一条旧文章时，把 HTML 正文回填进 Markdown 编辑器。
 * 覆盖 sanitize.ts 的 ALLOWED_TAGS 子集——有损转换，未知标签剥标签保留文本；
 * u/s/span/div 没有对应的 Markdown 语法，同样只保留内容。
 */

const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "PRE",
  "HR",
  "DIV",
  "SECTION",
])

function isElement(node: Node): node is Element {
  return node.nodeType === 1
}

function inline(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ""

  if (!isElement(node)) return ""

  const el = node
  const children = () => Array.from(el.childNodes).map(inline).join("")

  switch (el.tagName) {
    case "BR":
      return "\n"
    case "STRONG":
    case "B":
      return `**${children()}**`
    case "EM":
    case "I":
      return `*${children()}*`
    case "CODE": {
      const text = el.textContent ?? ""
      return text.includes("`") ? text : `\`${text}\``
    }
    case "A": {
      const text = children()
      const href = el.getAttribute("href")
      return href ? `[${text}](${href})` : text
    }
    case "IMG": {
      const alt = el.getAttribute("alt") ?? ""
      const src = el.getAttribute("src") ?? ""
      return src ? `![${alt}](${src})` : ""
    }
    default:
      return children()
  }
}

function listItems(list: Element, ordered: boolean): string {
  const items = Array.from(list.children).filter((child) => child.tagName === "LI")

  return items
    .map((li, index) => {
      const nested = Array.from(li.children).filter(
        (child) => child.tagName === "UL" || child.tagName === "OL",
      )
      const body = Array.from(li.childNodes)
        .filter((child) => !(isElement(child) && (child.tagName === "UL" || child.tagName === "OL")))
        .map(inline)
        .join("")
        .trim()

      let out = `${ordered ? `${index + 1}.` : "-"} ${body}`
      for (const sub of nested) {
        const block = listItems(sub, sub.tagName === "OL")
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")
        out += `\n${block}`
      }
      return out
    })
    .join("\n")
}

function block(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? ""
  if (!isElement(node)) return ""

  const el = node

  switch (el.tagName) {
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6": {
      const level = Number(el.tagName.slice(1))
      return `${"#".repeat(level)} ${inlineChildren(el).trim()}\n\n`
    }
    case "P":
      return `${inlineChildren(el).trim()}\n\n`
    case "UL":
      return `${listItems(el, false)}\n\n`
    case "OL":
      return `${listItems(el, true)}\n\n`
    case "BLOCKQUOTE": {
      const inner = Array.from(el.childNodes).map(block).join("").trim()
      const quoted = inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n")
      return `${quoted}\n\n`
    }
    case "PRE":
      return `\`\`\`\n${el.textContent ?? ""}\n\`\`\`\n\n`
    case "HR":
      return "---\n\n"
    case "DIV":
    case "SECTION": {
      const hasBlockChild = Array.from(el.childNodes).some(
        (child) => isElement(child) && BLOCK_TAGS.has(child.tagName),
      )
      if (hasBlockChild) return Array.from(el.childNodes).map(block).join("")
      return inlineChildren(el)
    }
    default:
      return inline(el)
  }
}

function inlineChildren(el: Element): string {
  return Array.from(el.childNodes).map(inline).join("")
}

export function htmlToMarkdown(html: string): string {
  if (!html) return ""
  const doc = new DOMParser().parseFromString(html, "text/html")
  return Array.from(doc.body.childNodes)
    .map(block)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
