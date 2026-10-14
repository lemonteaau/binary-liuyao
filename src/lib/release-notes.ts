/**
 * 各 a.b 版本的更新说明。构建时写进 version.json，由“有新版本”提示展示。
 * 提示框是旧标签页里的旧代码渲染的，说明只能这样从线上读取，写死在组件里旧标签页看不到。
 */
export const RELEASE_NOTES: Readonly<Record<string, string>> = {
  '2.3': '新功能：起卦音效，默认关闭，可在「设置」中开启。',
}
