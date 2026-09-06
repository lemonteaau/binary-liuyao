import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CopyButton } from '@/components/CopyButton'
import { DEFAULT_AI_INSTRUCTION } from '@/formatters/rawText'
import { useSettings } from '@/store/settings'

const SKILL_REPOSITORY =
  'https://github.com/lemonteaau/liuyao-eight-lesson-interpreter'
const SKILL_DOWNLOAD = `${SKILL_REPOSITORY}/archive/refs/heads/main.zip`
const AI_PROMPT = '请调用六爻skill，根据以上六爻排盘进行分析，要分析的问题是：'
const AGENT_INSTALL_PROMPT = `请帮我安装这个 Agent Skill：
${SKILL_REPOSITORY}

请使用当前 Agent 支持的用户级 Skill 安装方式，完整安装仓库里的 SKILL.md、references 和配套文件。安装完成后检查它能否被发现，并告诉我下一条消息该怎样调用它。`

type GuideShotProps = {
  src: string
  alt: string
  caption?: string
  width: number
  height: number
  size?: 'compact' | 'medium' | 'full'
  eager?: boolean
}

export function AiGuidePage() {
  const { settings, setAiInstruction, setAiInstructionPrompt } = useSettings()
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const isAiGuideConfigured = settings.aiInstruction
    && settings.aiInstructionPrompt === AI_PROMPT

  function applyAiGuideSettings() {
    setAiInstructionPrompt(AI_PROMPT)
    setAiInstruction(true)
    setConfirmOverwrite(false)
  }

  function requestAiGuideSetup() {
    const currentPrompt = settings.aiInstructionPrompt.trim()
    const hasCustomPrompt = currentPrompt.length > 0
      && currentPrompt !== DEFAULT_AI_INSTRUCTION
      && currentPrompt !== AI_PROMPT

    if (hasCustomPrompt) {
      setConfirmOverwrite(true)
      return
    }

    applyAiGuideSettings()
  }

  return (
    <article className="ai-guide pt-6 text-base leading-relaxed">
      <header className="ai-guide-hero">
        <p className="ai-guide-kicker">HEX//64 × AI</p>
        <h1>AI解卦教程</h1>
        <p>
          本教程以ChatGPT网页端和站长自行蒸馏的「八讲六爻解读」Skill为例，
          展示如何用AI解卦。
        </p>
        <div className="ai-guide-actions">
          <a className="btn btn-primary" href={SKILL_DOWNLOAD}>
            下载六爻Skill
          </a>
          <Link className="btn" to="/">
            开始起卦
          </Link>
        </div>
      </header>

      <section className="ai-guide-agent-install ai-guide-agent-install--top" aria-labelledby="agent-install-title">
        <div className="ai-guide-agent-install-heading">
          <p className="ai-guide-kicker">CODE AGENT</p>
          <div className="ai-guide-agent-title-row">
            <h2 id="agent-install-title">一键安装到Agent</h2>
            <div className="ai-guide-agent-logos" aria-label="支持 Codex、Claude Code 和 OpenCode等Agents">
              <img className="ai-guide-agent-logo--monochrome" src="/agent-icons/codex.svg" alt="Codex" title="Codex" width="36" height="36" />
              <img src="/agent-icons/claude-code.svg" alt="Claude Code" title="Claude Code" width="36" height="36" />
              <img className="ai-guide-agent-logo--monochrome" src="/agent-icons/opencode.svg" alt="OpenCode" title="OpenCode" width="36" height="36" />
            </div>
          </div>
        </div>
        <CopyButton
          label="复制安装指令"
          getText={() => AGENT_INSTALL_PROMPT}
          className="ai-guide-agent-copy"
        />
      </section>

      <GuideStep number="01" title="安装「八讲六爻解读」Skill" tag="首次使用">
        <p>
          先点击下载站长整理的<a href={SKILL_DOWNLOAD}>
            Skill压缩包
          </a>。项目已开源在
          <a href={SKILL_REPOSITORY} target="_blank" rel="noreferrer">
            GitHub 仓库
          </a>。
        </p>
        <p>
          回到 ChatGPT 网页端，从左侧进入 <b>Plugins</b>，切换到顶部的 <b>Skills</b>，
          然后点击右侧的加号。
        </p>
        <GuideShot
          src="/tutorial/01-open-skills.png"
          alt="ChatGPT 网页端依次标出 Plugins、Skills 和加号按钮"
          width={2458}
          height={1124}
        />
        <p>
          在弹出的菜单里选择 <b>Upload from your computer</b>，上传刚下载的 ZIP 文件。
        </p>
        <GuideShot
          src="/tutorial/02-upload-skill.png"
          alt="ChatGPT Skills 的新增菜单，其中 Upload from your computer 被标出"
          caption="直接上传 ZIP，不需要先解压。"
          width={612}
          height={396}
          size="compact"
        />
        <p>
          列表中出现「八讲六爻解读」，就说明安装完成。Skill会把固定的六爻解读规则带进对话，
          不必每次重新解释一遍。
        </p>
        <GuideShot
          src="/tutorial/04-skill-installed.png"
          alt="ChatGPT Skills 列表中显示已安装的八讲六爻解读"
          width={1648}
          height={676}
        />
        <p className="ai-guide-note">
          ChatGPT 的 Skills 功能可能需要会员订阅，并且会受账号或工作区权限影响。
          如果暂时看不到 Plugins 或 Skills，也可以复制页面上方的安装指令，
          尝试在 Codex、Claude Code、OpenCode 等工具中安装和调用。
        </p>
      </GuideStep>

      <GuideStep number="02" title="让复制内容自动带上 AI 指令" tag="推荐设置">
        <p>
          点击一次即可开启「附加 AI 指令」，并写入本教程推荐的提示词。你也可以稍后前往
          <Link to="/settings">设置</Link>修改。
        </p>
        <div className="ai-guide-quick-setup">
          <div>
            <span>AI COPY PRESET</span>
            <p>{isAiGuideConfigured ? '推荐设置已启用' : '自动开启并保存到当前浏览器'}</p>
          </div>
          <button
            type="button"
            className={`btn ${isAiGuideConfigured ? '' : 'btn-primary'}`}
            onClick={requestAiGuideSetup}
            disabled={isAiGuideConfigured}
          >
            {isAiGuideConfigured ? '已设置 ✓' : '一键设置'}
          </button>
        </div>
        {confirmOverwrite && (
          <div className="ai-guide-overwrite-confirm" role="alert">
            <p>检测到已有自定义提示词。是否用教程推荐内容覆盖？</p>
            <div>
              <button type="button" className="btn btn-primary" onClick={applyAiGuideSettings}>
                覆盖并启用
              </button>
              <button type="button" className="btn" onClick={() => setConfirmOverwrite(false)}>
                取消
              </button>
            </div>
          </div>
        )}
        <GuideShot
          src="/tutorial/05-configure-ai-prompt.png"
          alt="HEX//64 设置页的复制格式区域，已开启附加 AI 指令并填入推荐提示词"
          caption="设置会保存在当前浏览器中，通常只需配置一次。"
          width={1992}
          height={646}
        />
      </GuideStep>

      <GuideStep number="03" title="起卦，然后复制完整排盘" tag="每次使用">
        <p>
          回到<Link to="/">起卦页</Link>，任选一种方式完成起卦。进入结果页后点击 <b>复制排盘</b>。
        </p>
        <GuideShot
          src="/tutorial/06-copy-chart.png"
          alt="HEX//64 结果页的复制排盘按钮被红色箭头标出"
          width={1996}
          height={480}
        />
      </GuideStep>

      <GuideStep number="04" title="粘贴到 ChatGPT，并把问题说具体" tag="得到解读">
        <p>
          新建一个 ChatGPT 对话，粘贴刚才复制的内容。光标会停在最后一句提示词之后，
          在冒号后补上你的问题，再发送即可。
        </p>
        <div className="ai-guide-example">
          <span>问题示例</span>
          <p>我本人求职，想问下周五之前能否收到这家公司的Offer？</p>
        </div>
        <p>
          问题最好同时写清楚：<b>谁在问、问什么人或事、最关心的结果、时间范围</b>。
          <br/>
          部分问题，比如感情相关，最好写清楚<b>问题中所有涉及到的人的性别</b>。
          <br/>
          比起“最近运势如何”，具体问题更容易得到可核对的分析。
        </p>
        <GuideShot
          src="/tutorial/07-paste-in-chatgpt.png"
          alt="ChatGPT 输入框中已粘贴完整六爻排盘，末尾带有调用 Skill 的提示词"
          caption="确认排盘文字和最后一行提示都在，再补上问题并发送。"
          width={1000}
          height={796}
          size="medium"
        />
        <p className="ai-guide-note">
          如果 ChatGPT 没有自动调用该 Skill，可以在消息开头输入 @，手动选择「八讲六爻解读」后再发送。
        </p>
      </GuideStep>

      <section className="ai-guide-finish">
        <p className="ai-guide-kicker">READY</p>
        <h2>现在可以试一卦</h2>
        <p>
          AI 会先给出不含术语的总结，再展开判断。六爻解读只是工具，适合用来整理思路，
          不应也不能替代医疗、法律、财务或人身安全等方面的专业意见。
        </p>
        <Link className="btn btn-primary" to="/">
          返回起卦
        </Link>
      </section>
    </article>
  )
}

function GuideStep({
  number,
  title,
  tag,
  children,
}: {
  number: string
  title: string
  tag: string
  children: React.ReactNode
}) {
  return (
    <section className="ai-guide-step">
      <header>
        <span className="ai-guide-step-number">{number}</span>
        <div>
          <p>{tag}</p>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="ai-guide-step-body">{children}</div>
    </section>
  )
}

function GuideShot({
  src,
  alt,
  caption,
  width,
  height,
  size = 'full',
  eager = false,
}: GuideShotProps) {
  return (
    <figure className={`ai-guide-shot ai-guide-shot--${size}`}>
      <div>
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
