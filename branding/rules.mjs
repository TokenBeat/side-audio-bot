// Side Audio Bot 品牌替换规则 —— 文本改名层的唯一事实来源。
//
// 被 scripts/brand/apply.mjs 按顺序执行：
//   1. `keep` 正则先圈出必须原样保留的片段（上游模型 ID、第三方品牌、法务文本…）；
//   2. `rules` 只作用于保留片段之外的文本，按"具体在前、宽泛在后"排序；
//   3. 规则只做字面量替换，不涉及任何逻辑改动。
//
// 规则表与 archive/rebrand-branch 的实际结果逐文件比对校准过，其中包含若干
// 手工 rebrand 时代的特例（裸 qwen-audio → side-audio、唤醒词中文改名、
// LOG 模板带 BOT 等）——不要凭 REBRAND.md 的表格凭记忆修改，
// 改完跑 scripts/brand/check.mjs 和验收对比。
//
// 人工维护的完整文件覆盖（README、图标、架构图等）放在 branding/overlay/，
// 按 target 路径镜像存放，apply 时整文件覆盖、不做文本替换。
// 需要在品牌态删除的上游文件列在 removeList。

export const rules = [
  // 仓库路径 / 组织名
  { from: 'QwenAudio/qwen-audio-agent', to: 'TokenBeat/side-audio-bot' },
  { from: 'QwenAudio 组织', to: 'TokenBeat 组织' },
  // 架构图引用映射：rebrand 用新图替换 docs/ 前缀的旧图引用
  // （presentation 里的相对路径引用走 overlay，两处映射不同）
  { from: 'docs/qwen-audio-agent-three-layer-architecture.png', to: 'docs/architecture-overview.html' },
  { from: 'docs/qwen-audio-agent-three-layer-architecture-en.png', to: 'docs/architecture-overview-en.html' },
  { from: 'docs/qwen-audio-agent-three-layer-architecture.svg', to: 'docs/side-audio-bot-architecture-en.svg' },
  { from: 'docs/qwen-audio-agent-two-layer-architecture.png', to: 'docs/side-audio-bot-architecture-en.png' },
  // 中文产品名 / 唤醒词（rebrand 把唤醒词改成了"你好煤球"）
  { from: '你好千问', to: '你好煤球' },
  { from: 'n ǐ h ǎo q iān w èn', to: 'n ǐ h ǎo m éi q iú' },
  { from: '千问Audio', to: 'Side Audio' },
  // 特例：中文行文里 rebrand 在"叫"后补了空格（必须在通用规则之前）
  { from: '助手默认叫千问 Audio', to: '助手默认叫 Side Audio' },
  { from: '千问 Audio', to: 'Side Audio' },
  // 特例：car 架构图标题沿用 Agent 变体
  { from: 'Qwen Audio Agent Car 宏观系统架构', to: 'Side Audio Agent Car 宏观系统架构' },
  // camelCase 标识符（具体的在前）
  { from: 'QwenAudioAgentVoiceIO', to: 'SideAudioBotVoiceIO' },
  { from: 'QwenAudioAgentApp', to: 'SideAudioAgentApp' },
  { from: 'QwenAudioAgent', to: 'SideAudioAgent' },
  { from: 'qwenAudioAgent', to: 'sideAudioBot' }, // window.qwenAudioAgentDesktop 桥
  { from: 'QwenAudio', to: 'SideAudio' }, // electron-builder owner
  // 人类可读显示名（Car 等后缀自然被覆盖）
  { from: 'Qwen Audio Agent', to: 'Side Audio Bot' },
  { from: 'Qwen Audio', to: 'Side Audio' }, // 行文里的产品名；模型品牌语境由 keep 保护
  // 不属于任何前缀家族的环境变量
  { from: 'QWEN_AUDIO_CONSUMER_PROBE', to: 'SIDE_AUDIO_BOT_CONSUMER_PROBE' },
  { from: 'QWEN_AUDIO_ALLOW_UNCONFIGURED', to: 'SIDE_AUDIO_ALLOW_UNCONFIGURED' },
  { from: 'QWEN_AUDIO_SLEEP_TIMEOUT_SECONDS', to: 'SIDE_AUDIO_SLEEP_TIMEOUT_SECONDS' },
  { from: 'QWEN_AUDIO_GATEWAY_INSTANCE_ID', to: 'SIDE_AUDIO_GATEWAY_INSTANCE_ID' },
  { from: 'QWEN_AUDIO_GATEWAY_STARTED_AT', to: 'SIDE_AUDIO_GATEWAY_STARTED_AT' },
  // shared/runtime-environment.mjs state.env 模板特例：rebrand 此处带 BOT，
  // 其余 QWEN_AUDIO_LOG_* 都不带 —— 用整行精确匹配避免误伤
  { from: '# QWEN_AUDIO_LOG_LEVEL=info', to: '# SIDE_AUDIO_BOT_LOG_LEVEL=info' },
  { from: '# QWEN_AUDIO_LOG_MAX_BYTES=10485760', to: '# SIDE_AUDIO_BOT_LOG_MAX_BYTES=10485760' },
  { from: '# QWEN_AUDIO_LOG_MAX_FILES=5', to: '# SIDE_AUDIO_BOT_LOG_MAX_FILES=5' },
  // 环境变量前缀（具体家族在前，兜底在后）
  { from: 'QWEN_AUDIO_AGENT_', to: 'SIDE_AUDIO_BOT_' },
  { from: 'QWEN_AUDIO_GATEWAY_OWNER', to: 'SIDE_AUDIO_GATEWAY_OWNER' },
  { from: 'QWEN_AUDIO_LOG_', to: 'SIDE_AUDIO_LOG_' },
  { from: 'QWEN_AUDIO_MEMORY_', to: 'SIDE_AUDIO_MEMORY_' },
  { from: 'QWEN_AUDIO_WAKE_WORD_', to: 'SIDE_AUDIO_WAKE_WORD_' },
  { from: 'QWEN_AUDIO_ORB_', to: 'SIDE_AUDIO_ORB_' },
  { from: 'QWEN_AUDIO_DESKTOP_', to: 'SIDE_AUDIO_DESKTOP_' },
  { from: 'QWEN_AUDIO_SKIN_', to: 'SIDE_AUDIO_SKIN_' },
  // 其余 QWEN_AUDIO_* 家族兜底（WEB_SEARCH_、FRONTEND_、PREFERENCE_LEARNING 等
  // 上游新增变量沿用"无 BOT"惯例；REALTIME_* 等保留项由 keep 保护）
  { from: 'QWEN_AUDIO_', to: 'SIDE_AUDIO_' },
  // 大写目录/状态标识（CONFIG_DIR、DATA_DIR、GATEWAY_* 等）
  { from: 'QWAUDIO_', to: 'SIDEAUDIO_' },
  // CLI 命令名 / bin 名
  { from: 'qwenaudio', to: 'sideaudio' },
  // snake_case 标识符（ACP 工具名、cookie、correlation key）
  { from: 'qwen_audio_agent', to: 'side_audio_bot' },
  { from: 'qwen_audio_', to: 'side_audio_' },
  // 项目名（npm scope、com.* 服务标识、systemd unit、文档等）
  { from: 'qwen-audio-agent', to: 'side-audio-bot' },
  // 裸产品前缀（localStorage 键 side-audio-lang、TUI 提示符 'side-audio >'、文档行文）
  { from: 'qwen-audio', to: 'side-audio' },
  // 小写目录名 / 日志 schema / 缓存路径
  { from: 'qwaudio', to: 'sideaudio' },
  // 测试临时目录前缀（上游新增）
  { from: 'qwen-backend-runtime-', to: 'sideaudio-backend-runtime-' },
  { from: 'qwen-cockpit-', to: 'sideaudio-cockpit-' },
];

// 必须原样保留的片段（与 REBRAND.md §2.2 的"未替换"清单一一对应）。
export const keep = [
  /qwen-audio-3\\?\.0-realtime-(?:plus|flash)\b/g, // 含正则里的转义形态 3\.0
  /qwen3(?:\\?\.\d+)?(?:-[a-z0-9.]+)*/g, // qwen3、qwen3.5-omni-plus-realtime、qwen3.7-max…
  /(?<![\w-])Qwen3(?:\.\d+)?(?:[- ][A-Za-z0-9.+/]+)*/g, // Qwen3、Qwen3.5 Omni Plus/Flash、Qwen3-TTS…
  /qwen-(?:plus|flash|max|custom)\b/g,
  /(?<![\w-])qwen(?![\w-])/g, // 裸模型 ID / provider registry key（qwen.buildSession 等）
  /qwen-audio-realtime[\w.-]*/g, // DashScope provider id 家族
  /Qwen-Audio-Realtime[\w-]*/g,
  /Qwen Audio (?:Realtime|3\.0 (?:Plus|Flash|Realtime))\b/g, // 模型品牌显示名
  /Qwen Realtime\b/g,
  /Qwen Omni Realtime/g, // 模型家族显示名（无版本号形态）
  /qwen-omni-realtime/g, // 模型文档页 slug（改了断链）
  /Qwen3\.5 Omni (?:Plus|Flash) Realtime/g,
  /QWEN_\(\?:AUDIO\|OMNI\)_REALTIME_VOICE/g, // 测试正则里的厂商变量名
  /voice-frontends\/qwen-omni-realtime/g, // 上游文档站页面 slug（改了会断链）
  /QWEN_AUDIO_REALTIME_[A-Z0-9_]+/g, // 厂商语音前台配置变量
  /QWEN_OMNI_REALTIME_[A-Z0-9_]+/g,
  /Qwen Code|qwen-code\b|qwenCode[A-Za-z]*|QWEN_CODE_[A-Z_]*/g, // 第三方 Agent
  // Qwen Code 后端集成自己的凭证/探针标识（指第三方工具本身，不可改）
  /QWEN_API_KEY|QWEN_OAUTH_TOKEN|QWEN_HOME|QWEN_CREDENTIAL_KEYS/g,
  /qwenAuthenticationStatus|qwen-settings/g,
  /logo-qwen-icon|qwenLogo|qwen_logo\.svg/g, // cockpit 示例的 qwen logo 资源（文件名约定）
  /Qwen\.app/g,
  /QwenFrontend/g, // 测试助手，rebrand 时即保留
  /QwenAudioRealtimeProvider/g, // DashScope 派生 provider 类名，rebrand 保留
  /(?<![\w-])Qwen(?![\w-])(?! ?Audio| Code|\.app|Frontend| Realtime)/g, // 其余裸 Qwen 提法
  // 模型 / 服务提供方品牌语境（rebrand 保留，区别于产品行文）
  /DashScope Qwen Audio (?:and|与)/g,
  /Qwen Audio 服务地址/g,
  /\['audio', 'Qwen Audio'\]/g,
  /english\('Qwen Audio'\), 'Qwen Audio'/g,
  /the Qwen Audio endpoint/g,
  /legacy Qwen Audio realtime URL/g,
  /rejects invalid Qwen Audio service URLs/g, // 测试标题里的 provider 品牌
  /Application Support\/Qwen Audio(?! Agent)/g, // Electron 旧安装目录名（不带 Agent 后缀的形态），rebrand 保留
  // release-check 故意保留的上游仓库 URL（拆串拼接，只能整体保护）
  /LM\/qwen-audio-agent/g,
];

// 这些路径整文件跳过文本替换：
//   - 法务署名必须保留上游原文（overlay 会原样覆盖 NOTICE / THIRD_PARTY_NOTICES.md）
//   - 旧架构图 svg 的内文含产品名，rebrand 约定不改（文件名同样保留）
export const skipPaths = [
  /^branding\//,
  /^scripts\/brand\//,
  /^NOTICE$/,
  /^THIRD_PARTY_NOTICES\.md$/,
  /^docs\/qwen-audio-agent-(?:three|two)-layer-architecture.*\.svg$/,
];

// 品牌态需要删除的上游文件（cli bin 重命名为 sideaudio.mjs 后旧入口移除）。
export const removeList = ['cli/bin/qwenaudio.mjs'];
