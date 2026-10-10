declare const __APP_VERSION__: string
declare const __APP_BUILD__: string

/** 当前标签页加载的版本号（package.json 的 a.b.c），由 vite.config.ts 在构建时写入。 */
export const APP_VERSION = __APP_VERSION__
/** 当前标签页加载的那一次构建；每次部署都不同。 */
export const APP_BUILD = __APP_BUILD__

export type DeployedVersion = { version: string; build: string }

/** 版本号里的 a.b；只有它变了才值得打断用户，c 位的小更新不提示。 */
export function releaseOf(version: string): string {
  return version.split('.').slice(0, 2).join('.')
}

/** 读取线上最新版本；网络异常或返回内容不合法时为 null。 */
export async function fetchLatestVersion(signal?: AbortSignal): Promise<DeployedVersion | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return null
    const data = (await response.json()) as { version?: unknown; build?: unknown } | null
    if (typeof data?.version !== 'string' || !data.version) return null
    if (typeof data.build !== 'string' || !data.build) return null
    return { version: data.version, build: data.build }
  } catch {
    return null
  }
}
