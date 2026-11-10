import { useEffect, useRef, useState } from "react"
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react"
import { addFiles, removeById, type Attachment } from "@/lib/agentAttachments"
import { filterImageFiles } from "@/lib/agentUpload"
import { clearDraft, loadDraft, saveDraft } from "@/lib/agentDraft"

/** 自适应高度上限。 */
const MAX_TEXTAREA_HEIGHT = 160

/**
 * 输入区：自适应 textarea + 粘贴图片附件 + 发送/停止。
 * Enter 发送 / Shift+Enter 换行；中文输入法组字中的 Enter 不发送（isComposing）。
 */
export function ChatInput({
  disabled,
  streaming,
  onSend,
  onStop,
}: {
  disabled: boolean
  streaming: boolean
  onSend: (text: string, files: File[]) => Promise<boolean>
  onStop: () => void
}) {
  // 草稿：跳登录页来回一趟不丢字。惰性初始化即可，不必用 effect 回填。
  const [text, setText] = useState(() => loadDraft())
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [hint, setHint] = useState("")
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function updateText(next: string) {
    setText(next)
    saveDraft(next)
  }

  // 自适应高度
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [text])

  // 组件卸载时回收仍未发送的预览 URL
  useEffect(() => {
    return () => {
      setAttachments((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.url))
        return []
      })
    }
  }, [])

  async function submit() {
    const trimmed = text.trim()
    if ((!trimmed && attachments.length === 0) || disabled) return
    // 助手还在回复时不要把输入吞掉——保留文字并给出提示
    if (streaming) {
      setHint("助手正在回复，完成后即可发送")
      return
    }
    const ok = await onSend(trimmed, attachments.map((a) => a.file))
    if (!ok) {
      setHint("发送没成功，内容已保留，可以重试")
      textareaRef.current?.focus()
      return
    }
    attachments.forEach((a) => URL.revokeObjectURL(a.url))
    updateText("")
    setAttachments([])
    setHint("")
    clearDraft()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return
    // 中文输入法组字确认的 Enter 不发送
    if (e.nativeEvent.isComposing) return
    e.preventDefault()
    void submit()
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(e.clipboardData.files)
    if (pasted.length === 0) return
    e.preventDefault()
    const images = filterImageFiles(pasted)
    if (images.length === 0) {
      setHint("只支持图片，且单张不超过 10MB")
      return
    }
    setAttachments((prev) => addFiles(prev, images, (f) => URL.createObjectURL(f)))
  }

  function handleFilePick(e: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length === 0) return
    const images = filterImageFiles(picked)
    if (images.length < picked.length) {
      setHint("已忽略非图片或超过 10MB 的文件")
    }
    setAttachments((prev) => addFiles(prev, images, (f) => URL.createObjectURL(f)))
    // 允许再次选同一个文件
    e.target.value = ""
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return removeById(prev, id)
    })
  }

  const canSend = !disabled && (text.trim().length > 0 || attachments.length > 0)

  return (
    <div className="agent-input">
      <div className={`agent-input__container${focused ? " is-focused" : ""}`}>
        {attachments.length > 0 && (
          <div className="agent-input__attachments">
            {attachments.map((a) => (
              <div className="agent-input__attachment" key={a.id}>
                <img src={a.url} alt={a.name} />
                <button
                  type="button"
                  className="agent-input__remove"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={`移除 ${a.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="agent-input__row">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="agent-input__file"
            onChange={handleFilePick}
          />
          <button
            type="button"
            className="agent-input__attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="添加图片"
            title="添加图片"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={textareaRef}
            className="agent-input__textarea"
            placeholder={text.length === 0 && attachments.length === 0 ? "Enter 发送 · Shift+Enter 换行 · Ctrl+V 粘贴图片" : ""}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => updateText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {streaming ? (
            <button type="button" className="agent-input__stop" onClick={onStop} aria-label="停止生成">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="3" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="agent-input__send"
              disabled={!canSend}
              onClick={submit}
              aria-label="发送"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="agent-input__hint">
        {hint || "内容由AI生成，仅供参考"}
      </div>
    </div>
  )
}
