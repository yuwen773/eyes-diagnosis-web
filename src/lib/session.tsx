import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  ApiError,
  getLoginUser,
  login as loginApi,
  logout as logoutApi,
  type LoginUser,
} from "@/lib/api"

type SessionStatus = "loading" | "authed" | "anon"

type SessionValue = {
  user: LoginUser | null
  status: SessionStatus
  /**
   * 会话探测失败时的说明（服务不可用 / 网络不通）。
   * 非空表示「这一轮没验成」，不等于「你没登录」——两件事必须分开说。
   */
  probeError: string | null
  signIn: (account: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LoginUser | null>(null)
  const [status, setStatus] = useState<SessionStatus>("loading")
  const [probeError, setProbeError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const current = await getLoginUser()
      setUser(current ?? null)
      setStatus(current ? "authed" : "anon")
      setProbeError(null)
    } catch (error) {
      // 只有「未登录 / 无权限」才算匿名。5xx、网关返回的 HTML 错误页都不是——
      // 把它们读成匿名，等于网络抖一下就把人静默登出。
      if (error instanceof ApiError && (error.code === 40100 || error.code === 40101)) {
        setUser(null)
        setStatus("anon")
        setProbeError(null)
        return
      }
      // 探测失败 ≠ 没登录。已经认出来的会话保留着，只是这一轮没验成；
      // 从没登录过就落到匿名。两种情况都给出可重试的说明。
      //
      // 关键：status 必须离开 loading。refresh 的 rejection 在挂载时没人接，
      // 停在 loading 会让「正在核对访问权限」永远转下去。
      setStatus((prev) => (prev === "authed" ? "authed" : "anon"))
      setProbeError("服务这会儿没有响应，登录状态没验成")
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signIn = useCallback(async (account: string, password: string) => {
    const current = await loginApi({ userAccount: account, userPassword: password })
    setUser(current ?? null)
    setStatus(current ? "authed" : "anon")
    setProbeError(null)
  }, [])

  const signOut = useCallback(async () => {
    await logoutApi()
    setUser(null)
    setStatus("anon")
    setProbeError(null)
  }, [])

  const value = useMemo(
    () => ({ user, status, probeError, signIn, signOut, refresh }),
    [user, status, probeError, signIn, signOut, refresh],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error("useSession must be used inside SessionProvider")
  return value
}
