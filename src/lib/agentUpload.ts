import { uploadAgentImage } from "./api"
import {
  acquireAgentImage,
  releaseAgentImage,
  retainAgentImage,
} from "./agentImageOwnership"

const inFlight = new Map<string, Promise<string>>()

/** 单张图片上限 10MB。 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|tiff?)$/i

/**
 * 只放行图片、且不超过大小上限。
 * 部分浏览器剪贴板不给 MIME 类型，此时按扩展名兜底。
 */
export function filterImageFiles(files: File[]): File[] {
  return files.filter((f) => {
    const isImage = f.type.startsWith("image/") || (!f.type && IMAGE_EXT.test(f.name))
    return isImage && f.size <= MAX_IMAGE_SIZE
  })
}

/**
 * 上传器工厂。名字不叫 `use*`：它不调任何 Hook，在 `useMemo` 回调里调用
 * 会被 lint 当成 Hook 误用（规则本身是对的——只是命名误导）。
 */
export function createAgentUploader() {
  function fileKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`
  }

  async function uploadFiles(files: File[]): Promise<{ urls: string[] }> {
    const urls: string[] = []
    try {
      for (const file of files) {
        const key = fileKey(file)
        const existing = inFlight.get(key)
        const promise = existing ?? uploadAgentImage(file)
        if (!existing) {
          inFlight.set(key, promise)
        }
        const url = await promise
        // 无论与哪个并发批次共用这次上传，本批次都登记自己的一份持有权：
        // 去重只合并网络请求，不合并所有权。
        urls.push(url)
        acquireAgentImage(url)
      }
      return { urls }
    } catch (error) {
      // 失败即回滚本批次已上传成功的部分。页面在 catch 中直接返回，
      // 没有人会引用这些 URL，留着就是 COS 上的孤儿对象。
      // 走 release 而非直接删除，避免误删与其它批次共用的 URL。
      for (const url of urls) {
        releaseAgentImage(url)
      }
      throw error
    } finally {
      for (const file of files) {
        inFlight.delete(fileKey(file))
      }
    }
  }

  /** 消息已成功送达：交出持有权，对象转归这条消息所有 */
  function commitSuccess(urls: string[]) {
    for (const url of urls) {
      retainAgentImage(url)
    }
  }

  /** 消息未送达：释放持有权，无人持有时删除对象 */
  function commitFailure(urls: string[]) {
    for (const url of urls) {
      releaseAgentImage(url)
    }
  }

  return { uploadFiles, commitSuccess, commitFailure }
}
