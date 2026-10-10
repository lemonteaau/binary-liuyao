declare const __APP_VERSION__: string

/** 当前标签页加载的构建版本，由 vite.config.ts 在构建时写入。 */
export const APP_VERSION = __APP_VERSION__

/** 读取线上最新构建版本；网络异常或返回内容不合法时为 null。 */
export async function fetchLatestVersion(signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return null
    const data = (await response.json()) as { version?: unknown } | null
    return typeof data?.version === 'string' && data.version ? data.version : null
  } catch {
    return null
  }
}
