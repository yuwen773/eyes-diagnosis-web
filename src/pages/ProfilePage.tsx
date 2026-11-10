import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  describeError,
  listMyDiagnoses,
  updateProfile,
  uploadAvatar,
  type ErrorDetail,
} from "@/lib/api"
import { loadMyStats, statsLabels, type ScopedStats } from "@/lib/records"
import { faultFromError, infoFault, validationFault } from "@/lib/faults"
import { useFault } from "@/components/fault"
import { useSession } from "@/lib/session"
import { EmptyFrame } from "@/components/EmptyFrame"
import { SectionHead } from "@/components/SectionHead"
import { DisclaimerBar } from "@/components/DisclaimerBar"
import { SiteHeader } from "@/components/SiteHeader"

const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  user: "注册用户",
}

/** 服务端聚合未上线时，本页统计取自最近这一页记录。 */
const PROFILE_SAMPLE = 10

export function ProfilePage() {
  const { user, refresh } = useSession()
  const navigate = useNavigate()
  const { push } = useFault()

  const name = user?.userName || user?.userAccount || "账号"

  /* ── 判读统计（服务端全量优先，未上线时取最近一页） ───── */
  const [statsKey, setStatsKey] = useState(0)
  const [statsState, setStatsState] = useState<{
    key: number
    scoped: ScopedStats | null
    fault: ErrorDetail | null
  }>({ key: -1, scoped: null, fault: null })

  useEffect(() => {
    if (!user) return
    let alive = true

    listMyDiagnoses({ current: 1, pageSize: PROFILE_SAMPLE }).then(
      (value) =>
        loadMyStats(value.records ?? [], value.total ?? 0).then((scoped) => {
          if (!alive) return
          setStatsState({ key: statsKey, scoped, fault: null })
        }),
      (cause) => {
        if (!alive) return
        // 统计读不出来不拦着资料编辑，页面降级成「—」并给一条浮条。
        setStatsState((prev) => ({ ...prev, key: statsKey, fault: describeError(cause) }))
      },
    )

    return () => {
      alive = false
    }
  }, [user, statsKey])

  /* ── 资料编辑 ─────────────────────────────────────────── */
  const [nameDraft, setNameDraft] = useState("")
  const [profileDraft, setProfileDraft] = useState("")
  const [saving, setSaving] = useState(false)

  // 会话加载完成/变化后把草稿对齐到服务端值（只在用户变化时对齐一次）。
  const alignedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user) return
    const token = String(user.id ?? user.userAccount ?? "")
    if (alignedRef.current === token) return
    alignedRef.current = token
    setNameDraft(user.userName ?? "")
    setProfileDraft(user.userProfile ?? "")
  }, [user])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!user) return
    const nextName = nameDraft.trim()
    if (!nextName) {
      push(validationFault("昵称不能是空的——账号总得有个称呼"))
      return
    }

    setSaving(true)
    try {
      await updateProfile({
        userName: nextName,
        userProfile: profileDraft.trim() || undefined,
      })
      await refresh()
      push(infoFault("资料已更新"))
    } catch (cause) {
      push(faultFromError(cause, { intent: "generic" }))
    } finally {
      setSaving(false)
    }
  }

  /* ── 头像上传 ─────────────────────────────────────────── */
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  async function onAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (!file.type.startsWith("image/")) {
      push(validationFault("头像得是一张图片——当前选中的文件不是"))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      push(validationFault("图片超过 10MB，换一张小一点的"))
      return
    }

    setUploading(true)
    try {
      await uploadAvatar(file)
      await refresh()
      push(infoFault("头像已更新"))
    } catch (cause) {
      push(faultFromError(cause, { intent: "upload" }))
    } finally {
      setUploading(false)
    }
  }

  const statsLoading = statsState.key !== statsKey
  const statsFault = statsState.key === statsKey ? statsState.fault : null
  const scoped = statsState.key === statsKey ? statsState.scoped : null
  const stats = scoped?.stats ?? { total: 0, highRisk: 0 }
  const labels = statsLabels(scoped?.scope ?? "page")
  const highRiskLabel =
    scoped?.scope === "all" ? labels.highRisk : `近 ${PROFILE_SAMPLE} 条高风险`
  const roleLabel = useMemo(
    () => (user?.userRole ? (ROLE_LABEL[user.userRole] ?? user.userRole) : "—"),
    [user?.userRole],
  )

  if (!user) {
    // 会话还在探测时保持沉默，确认匿名后送登录页（带回跳）。
    return (
      <div className="is-field">
        <SiteHeader />
        <main className="wrap records">
          <SectionHead code="05" kicker="个人中心" en="ACCOUNT · PROFILE" />
          <div className="records__empty">
            <EmptyFrame label="未登录" />
            <p className="records__empty-title">登录后才能查看个人中心</p>
            <p className="records__empty-body">资料与判读统计都跟着账号走。</p>
            <Link className="btn" to="/login?redirect=%2Fprofile">
              去登录 <span className="btn__key">↗</span>
            </Link>
          </div>
        </main>
        <DisclaimerBar />
      </div>
    )
  }

  return (
    <div className="is-field">
      <SiteHeader />

      <main className="wrap records">
        <SectionHead code="05" kicker="个人中心" en="ACCOUNT · PROFILE" />

        <div className="records__intro">
          <p className="overline">Account · 账号</p>
          <h1 className="display records__title">个人中心</h1>
          <p className="lead">资料可改，头像可传，判读统计会从你的判读记录里实时汇总。</p>
        </div>

        <div className="strip records__strip">
          <div className="strip__cell">
            <div className="readout">
              <span className="readout__label">{labels.total}</span>
              <span className="readout__value num">
                {statsFault || statsLoading ? "—" : stats.total}
              </span>
            </div>
          </div>
          <div className="strip__cell">
            <div className="readout">
              <span className="readout__label">{highRiskLabel}</span>
              <span className="readout__value num">
                {statsFault || statsLoading ? "—" : stats.highRisk}
              </span>
            </div>
          </div>
          <div className="strip__cell">
            <div className="readout">
              <span className="readout__label">注册时间 · SINCE</span>
              <span className="readout__value readout__value--mono">
                {user.createTime ? user.createTime.slice(0, 10) : "—"}
              </span>
            </div>
          </div>
          <div className="strip__cell">
            <div className="readout">
              <span className="readout__label">角色 · ROLE</span>
              <span className="readout__value">{roleLabel}</span>
            </div>
          </div>
        </div>

        {statsFault ? (
          <div className="records__stats-note">
            判读统计这会儿没读出来（{statsFault.text}），
            <button type="button" className="link" onClick={() => setStatsKey((v) => v + 1)}>
              重试<span className="link__mark">↻</span>
            </button>
          </div>
        ) : null}

        {!statsFault && !statsLoading && scoped?.scope !== "all" ? (
          <p className="records__scope">
            带「近 {PROFILE_SAMPLE} 条」的统计只取自最近一页记录；服务端聚合上线后会自动切到全量。
          </p>
        ) : null}

        <div className="profile__grid">
          {/* ── 头像与账号铭牌 ─────────────────────────── */}
          <section className="profile__card">
            <div className="profile__card-head">
              <span className="overline">头像 · AVATAR</span>
            </div>

            <div className="profile__avatar-row">
              <span className="profile__avatar" aria-hidden="true">
                {user.userAvatar ? (
                  <img src={user.userAvatar} alt="" />
                ) : (
                  <span className="profile__avatar-fallback">{name.slice(0, 1)}</span>
                )}
              </span>

              <div className="profile__avatar-actions">
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "上传中…" : "更换头像"}
                  <span className="btn__key">↥</span>
                </button>
                <p className="profile__avatar-hint">
                  支持 JPG / PNG / WebP，10MB 以内。上传后立即生效，全站可见。
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => void onAvatarChange(event)}
                />
              </div>
            </div>
          </section>

          {/* ── 资料编辑 ───────────────────────────────── */}
          <section className="profile__card">
            <div className="profile__card-head">
              <span className="overline">资料 · PROFILE</span>
            </div>

            <form className="profile__form" onSubmit={(event) => void saveProfile(event)}>
              <label className="profile__field">
                <span className="profile__label">昵称</span>
                <input
                  className="profile__input"
                  value={nameDraft}
                  maxLength={30}
                  onChange={(event) => setNameDraft(event.target.value)}
                  placeholder="怎么称呼你"
                />
              </label>

              <label className="profile__field">
                <span className="profile__label">简介</span>
                <textarea
                  className="profile__input profile__input--area"
                  value={profileDraft}
                  maxLength={200}
                  rows={3}
                  onChange={(event) => setProfileDraft(event.target.value)}
                  placeholder="一句话介绍（选填）"
                />
              </label>

              <label className="profile__field">
                <span className="profile__label">账号</span>
                <input className="profile__input" value={user.userAccount ?? ""} disabled readOnly />
              </label>

              <div className="profile__form-foot">
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? "保存中…" : "保存资料"}
                  <span className="btn__key">↵</span>
                </button>
                <span className="profile__form-note">账号与角色不可自行修改。</span>
              </div>
            </form>
          </section>
        </div>

        {/* 判读台账入口 */}
        <div className="profile__ledger-link">
          <button type="button" className="link" data-cursor onClick={() => navigate("/records")}>
            查看全部判读记录
            <span className="link__mark">→</span>
          </button>
        </div>
      </main>

      <DisclaimerBar />
    </div>
  )
}
