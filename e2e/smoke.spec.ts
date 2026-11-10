import { expect, test, type Page } from "@playwright/test"

/**
 * 四条验收冒烟：登录 → 判读槽、记录纸、资讯详情、Agent 回复。
 * 账号从环境变量取；缺账号时整体 skip（不红），见 e2e/README.md。
 */
const user = process.env.E2E_USER
const password = process.env.E2E_PASSWORD
const hasAccount = Boolean(user && password)

async function login(page: Page) {
  await page.goto("/login")
  await page.getByPlaceholder("useraccount").fill(user!)
  await page.locator('input[type="password"]').fill(password!)
  await page.getByRole("button", { name: "登录" }).click()
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 })
}

test.describe("验收冒烟", () => {
  test.skip(
    !hasAccount,
    "需要 E2E_USER / E2E_PASSWORD，以及运行中的后端（见 e2e/README.md）",
  )

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test("登录后判读页的影像槽可见", async ({ page }) => {
    await page.goto("/diagnosis")
    await expect(page.getByText("点击或拖入影像")).toBeVisible()
  })

  test("记录页展开第一条，能看到记录纸标题", async ({ page }) => {
    await page.goto("/records")
    const firstRow = page.locator(".records__row").first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })
    await firstRow.click()
    await expect(page.getByText(/AI 判读结果/).first()).toBeVisible({ timeout: 15_000 })
  })

  test("资讯页点第一条，详情标题可见", async ({ page }) => {
    await page.goto("/news")
    const firstCard = page.locator(".chroma-card").first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })
    await firstCard.click()
    await expect(page.locator("h1.news-detail__title")).toBeVisible({ timeout: 15_000 })
  })

  test("Agent 发送后 30 秒内出现回复气泡", async ({ page }) => {
    await page.goto("/agent")
    const input = page.getByPlaceholder(/Enter 发送/)
    await input.fill("你好")
    await input.press("Enter")
    await expect(page.locator(".agent-msg--assistant").first()).toBeVisible({
      timeout: 30_000,
    })
  })
})
