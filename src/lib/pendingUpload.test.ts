// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { clearPendingUpload, rememberPendingUpload, takePendingUpload } from "./pendingUpload"

const file = () => new File(["x"], "eye.jpg", { type: "image/jpeg" })

describe("pendingUpload", () => {
  beforeEach(() => clearPendingUpload())

  it("取出一次后即清空，避免跨账号泄漏", () => {
    rememberPendingUpload(file())

    expect(takePendingUpload()?.name).toBe("eye.jpg")
    expect(takePendingUpload()).toBeNull()
  })

  it("没有暂存时返回 null", () => {
    expect(takePendingUpload()).toBeNull()
  })
})
