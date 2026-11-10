/**
 * 匿名上传被 401 打断时的临时暂存。
 *
 * 只活在当前 SPA 会话里（模块级变量），不落 localStorage——影像文件也不该
 * 持久化在本机。登录返回后 take 一次即清空，避免下个账号读到上一个人的文件。
 */

let pending: File | null = null

export function rememberPendingUpload(file: File): void {
  pending = file
}

export function takePendingUpload(): File | null {
  const file = pending
  pending = null
  return file
}

export function clearPendingUpload(): void {
  pending = null
}
