import { useEffect, useState, type RefCallback } from "react"

/**
 * 元素进入视口后只触发一次的观察器。
 * 用于让读数、概率条这类「仪器指标」在出现时才走动，而不是一加载就到位。
 */
export function useInView<T extends Element>(
  rootMargin = "0px 0px -8% 0px",
): [RefCallback<T | null>, boolean] {
  const [node, setNode] = useState<T | null>(null)
  // 没有 IntersectionObserver 的环境（测试 / 老浏览器）直接视为可见。
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined")

  useEffect(() => {
    if (!node || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold: 0.01 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, rootMargin, inView])

  return [setNode, inView]
}

/**
 * 扫描页面上的 `.reveal`，进入视口后加上 `is-in`。
 * 每个页面挂一次即可；错峰由元素自己的 `--d` 控制。
 */
export function useRevealScan() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".reveal"))
    if (!nodes.length) return
    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach((node) => node.classList.add("is-in"))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add("is-in")
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.04 },
    )

    nodes.forEach((node) => {
      if (node.getBoundingClientRect().top < window.innerHeight * 0.9) {
        node.classList.add("is-in")
        return
      }
      observer.observe(node)
    })

    return () => observer.disconnect()
  }, [])
}
