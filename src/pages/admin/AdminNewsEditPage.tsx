import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { SectionHead } from "@/components/SectionHead"
import { Toolbar } from "@/components/admin/Toolbar"
import { FaultNote } from "@/components/fault"
import {
  getNews,
  saveNews,
  uploadNewsCover,
  type AdminNews,
} from "@/lib/adminApi"
import { NEWS_STATUS_OPTIONS, newsContentValid } from "@/lib/adminDomain"
import { describeError, type ErrorDetail } from "@/lib/api"
import { fault, infoFault, validationFault } from "@/lib/faults"
import { renderMarkdown } from "@/lib/markdown"
import { htmlToMarkdown } from "@/lib/htmlToMarkdown"

/** 加载 / 错误 / 数据三态同源；不在各事件里散着维护布尔量（对齐 AdminUsersPage）。 */
type View = { data: AdminNews | null; fault: ErrorDetail | null; loading: boolean }

/** 表单是唯一真源：加载完成后把 getNews 的结果一次灌进来。
 *  status 缺省表示「后端没给」（老数据）——保存时省略该键，靠 MyBatis-Plus
 *  NOT_NULL 策略保留库中现值，绝不凭空把已发布新闻写成草稿。 */
type Form = { title: string; content: string; coverImage?: string; status?: number }

const EMPTY_FORM: Form = { title: "", content: "" }

const MAX_COVER_BYTES = 5 * 1024 * 1024
const COVER_ACCEPT = "image/jpeg,image/png"
const SUMMARY_HINT = "正文至少 30 字（后端以正文前 30 字生成摘要）"
/** 新建模式降级引导文案：控制器裁定，对齐 Vue 版实际能力（见文件头注释）。 */
const NEW_GUIDE = "后端暂不支持新建，请从列表选择一条新闻编辑"

/** 封面预检：JPG/PNG + ≤5MB。返回 null 表示通过，否则给出页内提示文案（句号收尾）。 */
function coverProblem(file: File): string | null {
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    return "只能上传 JPG/PNG 格式的图片。"
  }
  if (file.size > MAX_COVER_BYTES) {
    return "图片大小不能超过 5MB。"
  }
  return null
}

/**
 * 新闻编辑（真实端点）。
 *
 * 路由 `/admin/news/:id/edit`，`id === "new"` 为新建。编辑模式挂载时 getNews(id)
 * 灌表单，加载/失败走页内三态；取数沿用 requestSeq 递增序号挡过期响应（StrictMode
 * 双挂载下只有最后一次写 view）。
 *
 * 新建模式是「降级引导」（控制器裁定，对齐 Vue 版实际能力）：后端
 * NewsController.updateNews 对 id==null 直接抛 PARAMS_ERROR，且 Vue 版所谓「新建」
 * 也只是文案——其路由 /news/edit/:id 恒带 id、handleSave 硬编码
 * Number(route.params.id)，Vue 实际也没有能跑通的新建路径。因此保留
 * /admin/news/new/edit 路由与空表单（标题 / 正文 / 预览仍可用于撰写草稿参考），
 * 但保存按钮禁用并给出行内说明，不向后端发注定失败的请求。
 *
 * 编辑模式保存有两条硬规矩：一是 newsContentValid 的 30 字守卫（后端
 * substring(0,30) 对短文会 500）；二是成功留在本页用页内成功条。
 * 封面仅编辑模式可传（uploadCover 需要已存在的 id）；成功把返回 url 写回表单，
 * 清除封面把 coverImage 置 undefined，保存时以空串显式上送（后端 NOT_NULL 策略
 * 会丢 null，空串才会真正写入库），保存后生效。
 */
export function AdminNewsEditPage(): ReactElement {
  const { id } = useParams()
  const navigate = useNavigate()

  const isNew = id === "new" || !id
  const newsId = isNew ? null : id!

  const [form, setForm] = useState<Form>(EMPTY_FORM)
  /** 旧文章的原始 HTML；正文未改时原样提交，避免有损往返。 */
  const [legacyHtml, setLegacyHtml] = useState<string | null>(null)
  const [contentDirty, setContentDirty] = useState(false)
  const [view, setView] = useState<View>({
    data: null,
    fault: null,
    loading: !isNew,
  })
  const requestSeq = useRef(0)

  const [tab, setTab] = useState<"edit" | "preview">("edit")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formFault, setFormFault] = useState<ReturnType<typeof validationFault> | null>(null)
  const [actionError, setActionError] = useState<ErrorDetail | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /** 纯取数：不碰 state，只返回当前序号，供续体判断是否仍是最后一次请求。 */
  const fetchNews = useCallback((targetId: string): { seq: number; result: Promise<AdminNews> } => {
    const seq = ++requestSeq.current
    return { seq, result: getNews(targetId) }
  }, [])

  // 首次挂载（仅编辑模式）加载一次：setState 全在 Promise 续体里，effect 体内不写 state，
  // 符合 react-hooks/set-state-in-effect。新建模式不发请求、view 保持 loading=false。
  useEffect(() => {
    if (!newsId) return
    const { seq, result } = fetchNews(newsId)
    result.then(
      (data) => {
        if (seq !== requestSeq.current) return
        const raw = data.content ?? ""
        const isHtml = /<[a-z][\s\S]*>/i.test(raw)
        setLegacyHtml(isHtml ? raw : null)
        setContentDirty(false)
        setForm({
          title: data.title ?? "",
          content: isHtml ? htmlToMarkdown(raw) : raw,
          coverImage: data.coverImage ?? undefined,
          status: data.status ?? undefined,
        })
        setView({ data, fault: null, loading: false })
      },
      (cause) => {
        if (seq !== requestSeq.current) return
        setView({ data: null, fault: describeError(cause), loading: false })
      },
    )
  }, [fetchNews, newsId])

  function patch(next: Partial<Form>) {
    setForm((prev) => ({ ...prev, ...next }))
  }

  // 只在预览态解析：编辑态每敲一个字都重渲染，没必要把全文再过一遍
  // markdown+hljs（O(n²)，与 AssistantMessage 的流式策略同源）。
  const previewHtml = tab === "preview" ? renderMarkdown(form.content) : ""

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    // 新建模式保存按钮禁用 + 引导说明，这里再兜一道：绝不向后端发注定被拒的请求。
    if (saving || isNew) return
    setFormFault(null)
    setActionError(null)
    setSuccess(null)

    if (!newsContentValid(form.content)) {
      setFormFault(validationFault(SUMMARY_HINT))
      return
    }

    setSaving(true)
    try {
      // 旧版 HTML 且正文没改：原样提交，不做有损往返。
      const content = legacyHtml && !contentDirty ? legacyHtml : renderMarkdown(form.content)
      // status 只在后端给过时才上送：键缺席 → DTO 的 status 为 null →
      // MyBatis-Plus NOT_NULL 策略跳过 UPDATE SET，库中现值保持。老数据（NewsVO
      // 没有 status）因此不会被一次编辑静默降成草稿；新数据则能真正改发布状态。
      await saveNews({
        ...(newsId ? { id: newsId } : {}),
        title: form.title,
        content,
        ...(form.status === undefined ? {} : { status: form.status }),
        // 无条件上送 coverImage：后端 MyBatis-Plus 默认 FieldStrategy.NOT_NULL，
        // null 字段不进 UPDATE SET。清封面时若用 `...(coverImage ? {…} : {})` 丢键，
        // DTO 反序列化成 null → 旧封面被保留，前端却提示「已清除」，静默 no-op。
        // 用空串（非 null）显式写库，才能把「清除」与「不改」区分开。
        coverImage: form.coverImage ?? "",
      })
      setSuccess("已保存")
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setSaving(false)
    }
  }

  function onPickCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = "" // 允许再次选择同名文件
    if (!file || !newsId) return

    const problem = coverProblem(file)
    if (problem) {
      setFormFault(validationFault(problem))
      return
    }

    setFormFault(null)
    setActionError(null)
    setSuccess(null)
    setUploading(true)
    uploadNewsCover(newsId, file).then(
      (url) => {
        setUploading(false)
        patch({ coverImage: url })
        setSuccess("封面已更新")
      },
      (cause) => {
        setUploading(false)
        setActionError(describeError(cause))
      },
    )
  }

  function clearCover() {
    // 置 undefined 表示「清除意图」；保存时 onSubmit 把它序列化成空串上送
    // （coverImage: form.coverImage ?? ""），空串非 null、能过后端 NOT_NULL
    // 策略写进 UPDATE SET，真正把旧封面从库里抹掉。
    patch({ coverImage: undefined })
    setFormFault(null)
    setActionError(null)
    setSuccess("封面已清除，保存后生效")
  }

  return (
    <div className="admin-newsedit">
      <div className="admin-newsedit__head">
        <SectionHead
          code="03"
          kicker={isNew ? "新闻管理 · 新建" : "新闻管理 · 编辑"}
          en="ADMIN · NEWS EDIT"
        />
        <button
          type="button"
          className="btn btn--ghost btn--sm admin-newsedit__back"
          onClick={() => navigate("/admin/news")}
        >
          返回列表
        </button>
      </div>

      {view.loading ? (
        <p className="admin-newsedit__state">正在读取新闻…</p>
      ) : view.fault ? (
        <FaultNote
          className="admin-newsedit__fault"
          fault={fault({
            severity: "attention",
            kind: "client",
            title: view.fault.text,
            code: view.fault.code,
          })}
        />
      ) : (
        <form className="admin-newsedit__form" onSubmit={onSubmit}>
          {/* 工具行：编辑 / 预览 mono tab + 保存。预览切换只换下半区，
              上半区标题与封面在两种视图下都常驻，避免切到预览就丢了字段入口。 */}
          <Toolbar>
            <div className="admin-newsedit__tools">
              <div className="admin-newsedit__tabs" role="tablist" aria-label="编辑视图">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "edit"}
                  className="admin-newsedit__tab num"
                  onClick={() => setTab("edit")}
                >
                  编辑
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "preview"}
                  className="admin-newsedit__tab num"
                  onClick={() => setTab("preview")}
                >
                  预览
                </button>
              </div>

              <div className="admin-newsedit__actions">
                <button
                  className="btn btn--sm"
                  type="submit"
                  disabled={saving || isNew}
                  title={isNew ? NEW_GUIDE : undefined}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </Toolbar>

          {/* 新建模式降级引导：后端不支持新建，表单只供撰写草稿参考。 */}
          {isNew ? (
            <p className="admin-newsedit__guide num">{NEW_GUIDE}</p>
          ) : null}

          {legacyHtml ? (
            <p className="admin-newsedit__guide num">
              本文为旧版 HTML，正文已转换为 Markdown 供编辑；一旦修改并保存，将以 Markdown 重写正文。
            </p>
          ) : null}

          {formFault ? (
            <FaultNote className="admin-newsedit__fault" fault={formFault} variant="field" />
          ) : null}
          {actionError ? (
            <FaultNote
              className="admin-newsedit__fault"
              fault={fault({
                severity: "attention",
                kind: "client",
                title: actionError.text,
                code: actionError.code,
              })}
            />
          ) : null}
          {success ? (
            <FaultNote
              className="admin-newsedit__fault"
              fault={infoFault(success)}
              variant="field"
            />
          ) : null}

          <div className="admin-newsedit__fields">
            <label className="admin-newsedit__field">
              <span className="admin-newsedit__label">标题 · TITLE</span>
              <input
                className="admin-newsedit__input"
                type="text"
                value={form.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder="输入文章标题…"
                aria-label="标题"
              />
            </label>

            <label className="admin-newsedit__field">
              <span className="admin-newsedit__label">发布状态 · STATUS</span>
              <select
                className="admin-newsedit__select"
                value={form.status ?? ""}
                onChange={(event) =>
                  patch({
                    status:
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value),
                  })
                }
                disabled={isNew}
                aria-label="发布状态"
              >
                {/* 后端没给状态时（老数据）留一条只读占位，保存仍省略该键。 */}
                {form.status === undefined ? (
                  <option value="">未知（保存时保持原值）</option>
                ) : null}
                {NEWS_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <section className="admin-newsedit__cover" aria-label="封面图片">
              <span className="admin-newsedit__label">封面 · COVER</span>
              <div className="admin-newsedit__cover-row">
                {form.coverImage ? (
                  <img
                    className="admin-newsedit__cover-thumb"
                    src={form.coverImage}
                    alt="新闻封面"
                  />
                ) : (
                  <span className="admin-newsedit__cover-empty num" aria-hidden="true">
                    NO COVER
                  </span>
                )}
                <div className="admin-newsedit__cover-actions">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={COVER_ACCEPT}
                    className="admin-newsedit__file-input"
                    onChange={onPickCover}
                    aria-label="选择封面图片"
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={isNew || uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? "上传中…" : form.coverImage ? "更换封面" : "上传封面"}
                  </button>
                  {form.coverImage ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={isNew}
                      onClick={clearCover}
                    >
                      清除封面
                    </button>
                  ) : null}
                  <span className="admin-newsedit__cover-hint num">
                    JPG / PNG · ≤5MB
                  </span>
                </div>
              </div>
            </section>

            <div className="admin-newsedit__editor">
              {tab === "edit" ? (
                <label className="admin-newsedit__field admin-newsedit__field--body">
                  <span className="admin-newsedit__label">正文 · MARKDOWN</span>
                  <textarea
                    className="admin-newsedit__textarea"
                    value={form.content}
                    onChange={(event) => {
                      setContentDirty(true)
                      patch({ content: event.target.value })
                    }}
                    placeholder="用 Markdown 撰写正文…"
                    aria-label="正文"
                  />
                </label>
              ) : (
                <div className="admin-newsedit__preview">
                  <span className="admin-newsedit__label">预览 · PREVIEW</span>
                  {/* markdown.ts 以 html:false 渲染，原始 HTML 已转义、危险链接被禁用；
                      与 AssistantMessage 同一条 innerHTML 注入路径。 */}
                  <div
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              )}
            </div>
          </div>

          <p className="admin-newsedit__footer num">{SUMMARY_HINT}</p>
        </form>
      )}
    </div>
  )
}

export default AdminNewsEditPage
