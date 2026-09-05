# Side Audio Bot Rebrand

本项目从 `qwen-audio-agent` 重命名为 `side-audio-bot`。本文档记录整体修改范围、替换规则和未替换项，便于后续维护和上游代码合并时参考。

## 1. 重命名范围

- **项目名称**：`qwen-audio-agent` → `side-audio-bot`
- **npm 包名**：`qwen-audio-agent` → `side-audio-bot`
- **GitHub 仓库**：`QwenAudio/qwen-audio-agent` → `TokenBeat/side-audio-bot`
- **CLI 入口**：`qwenaudio` → `sideaudio`（命令名）
- **环境变量前缀**：
  - `QWEN_AUDIO_AGENT_*` → `SIDE_AUDIO_BOT_*`（主要规则，覆盖 URL、Session、Backend、Runtime、Auth、Identity、NodePath、Skills、ModelPath、MemoryPath、TaskState 等）
  - `QWEN_AUDIO_GATEWAY_OWNER` → `SIDE_AUDIO_GATEWAY_OWNER`
  - `QWEN_AUDIO_LOG_*` → `SIDE_AUDIO_LOG_*`
  - `QWEN_AUDIO_MEMORY_*` → `SIDE_AUDIO_MEMORY_*`
  - `QWEN_AUDIO_WAKE_WORD_*` → `SIDE_AUDIO_WAKE_WORD_*`
  - `QWAUDIO_CONFIG_DIR` → `SIDEAUDIO_CONFIG_DIR`（无下划线，与上述规则不同）
  - `QWAUDIO_DATA_DIR` → `SIDEAUDIO_DATA_DIR`（同上）
- **目录名**：`qwaudio` → `sideaudio`（所有配置/缓存/数据目录统一）

## 2. 文本替换规则

### 2.1 已替换

| 原内容 | 新内容 | 说明 |
|--------|--------|------|
| `qwen-audio-agent` | `side-audio-bot` | 项目产品名 |
| `QwenAudio/qwen-audio-agent` | `TokenBeat/side-audio-bot` | GitHub 仓库路径 |
| `QWEN_AUDIO_AGENT_*` | `SIDE_AUDIO_BOT_*` | 主要环境变量前缀（URL、Session、Backend、Runtime、Auth、Identity、NodePath 等） |
| `QWEN_AUDIO_GATEWAY_OWNER` | `SIDE_AUDIO_GATEWAY_OWNER` | Gateway 服务标识环境变量 |
| `QWEN_AUDIO_LOG_*` | `SIDE_AUDIO_LOG_*` | 日志环境变量 |
| `QWEN_AUDIO_MEMORY_*` | `SIDE_AUDIO_MEMORY_*` | 记忆系统环境变量 |
| `QWEN_AUDIO_WAKE_WORD_*` | `SIDE_AUDIO_WAKE_WORD_*` | 唤醒词环境变量 |
| `QWAUDIO_CONFIG_DIR` | `SIDEAUDIO_CONFIG_DIR` | 数据目录环境变量（无下划线） |
| `QWAUDIO_DATA_DIR` | `SIDEAUDIO_DATA_DIR` | 数据目录环境变量（无下划线） |
| `qwenaudio` | `sideaudio` | CLI 命令名 |
| `com.qwen-audio-agent.gateway` | `com.side-audio-bot.gateway` | Desktop 服务标识 |
| `qwen-audio-agent-gateway.service` | `side-audio-bot-gateway.service` | systemd 服务单元名 |
| `@qwen-audio-agent/cli` | `@side-audio-bot/cli` | npm workspace 包名 |
| `@qwen-audio-agent/desktop` | `@side-audio-bot/desktop` | npm workspace 包名 |
| `qwen-audio`（TUI/Web 前缀、文档描述） | `side-audio-bot` | 用户可见的产品名 |
| `qwaudio`（目录名、路径、schema） | `sideaudio` | 文件系统目录名、日志 schema、缓存路径等统一替换 |

### 2.2 未替换

| 原内容 | 原因 |
|--------|------|
| `qwen-audio-3.0-realtime-plus` | DashScope 模型 ID，外部 API 标识 |
| `qwen-audio-3.0-realtime-flash` | DashScope 模型 ID，外部 API 标识 |
| `qwen3.5-omni-flash-realtime` | 模型 ID，非产品名 |
| `qwen3.5-omni-plus-realtime` | 模型 ID，非产品名 |
| `QWEN_AUDIO_REALTIME_MODEL` | 厂商语音前台配置变量，保留原样 |
| `QWEN_AUDIO_REALTIME_VOICE` | 厂商语音前台配置变量，保留原样 |
| `QWEN_AUDIO_REALTIME_PROVIDER` | 厂商语音前台配置变量，保留原样 |
| `QWEN_OMNI_REALTIME_VOICE` | 厂商语音前台配置变量，保留原样 |
| `Qwen Code` | 第三方 Agent 名称，保留原样 |
| `qwen-audio-realtime` | DashScope provider ID，外部标识 |
| 图片文件名（如 `qwen-audio-agent-three-layer-architecture-*.png`） | 按约定不替换文件名 |

## 3. 特殊处理

### 3.1 架构图

- 新建交互式架构概览图：
  - `docs/architecture-overview.html`（中文）
  - `docs/architecture-overview-en.html`（英文）
- README 主架构图改为引用新 HTML 文件
- 详细架构图仍使用原始 PNG：`docs/qwen-audio-agent-three-layer-architecture-*.png`
- `docs/architecture.png` 保留，供架构演示文稿使用

### 3.2 数据目录迁移

- 新增 `migrateLegacyDataDirectory()` 函数
- 自动迁移旧配置目录 `~/.config/qwaudio` → `~/.config/sideaudio`
- 迁移时重命名 `state.env` 中的密钥名：`QWEN_AUDIO_AGENT_AUTH_SECRET` → `SIDE_AUDIO_BOT_AUTH_SECRET`

### 3.3 localStorage 语言键

- 新键名：`side-audio-lang`
- 保留 legacy fallback：`qwen-audio-lang`（兼容旧用户浏览器本地存储）

### 3.4 CLI 二进制文件名

- `cli/bin/qwenaudio.mjs` → `cli/bin/sideaudio.mjs`
- 对应更新 `cli/package.json` 中的 bin 入口

## 4. 文件变化统计

```
240 files changed, 4250 insertions(+), 3590 deletions(-)
```

主要修改目录：
- `.github/` - CI/CD 配置
- `cli/` - CLI 入口、参数、配置命令
- `config/` - 示例配置
- `desktop/` - Electron 桌面应用
- `docs/` - 文档和架构图
- `examples/` - 示例项目
- `scripts/` - 发布和校验脚本
- `server/` - Gateway 服务
- `shared/` - 共享运行时环境
- `tui/` - 终端 UI
- `web/` - Web UI
- 根目录文件（README、LICENSE、NOTICE 等）

## 5. 验证和测试

已运行并通过以下模块测试：
- `server/test/config.test.mjs`：14/14 通过
- `cli/test/launcher.test.mjs`：28/28 通过
- `tui/test/index.test.mjs`：34/34 通过
- `web/test/*.test.mjs`：84/84 通过

注：`test/embedded-gateway.test.mjs` 在 rebrand 前即存在失败，非本次修改引入。

## 6. 兼容性说明

### 6.1 环境变量兼容

新环境变量优先，旧环境变量保留 fallback：
- `SIDE_AUDIO_BOT_CONFIG_DIR` > `QWAUDIO_CONFIG_DIR`
- `SIDE_AUDIO_BOT_DATA_DIR` > `QWAUDIO_DATA_DIR`

### 6.2 数据目录迁移

首次启动时自动迁移：
- 源目录：`~/.config/qwaudio`
- 目标目录：`~/.config/sideaudio`
- 幂等操作，已迁移目录不会重复处理

### 6.3 浏览器本地存储

- 新用户使用 `side-audio-lang`
- 旧用户自动回退到 `qwen-audio-lang`

## 7. 注意事项

1. **文件名约定**：除 `cli/bin/sideaudio.mjs` 外，其余文件名保持原样，不替换 `qwen-audio` 开头的文件名
2. **模型 ID**：DashScope 模型 ID 保持原样，这些是外部 API 标识
3. **Agent 名称**：第三方 Agent（如 Qwen Code）保持原名称
4. **版权声明**：LICENSE 和 NOTICE 保留原始版权信息

## 8. 上游合并机制（2026-09 起改为品牌层方案）

改名层不再以分支形态维护，rebrand 分支已退役为 `archive/rebrand-branch` tag（仅作验收参照）。现行机制：

- 分支拓扑：`main` 完全镜像上游；`dev` 只保留增量功能（保持上游原始命名），合并上游零冲突
- 本文 §2 的替换规则已机器化为 `branding/rules.mjs`（含 keep 保留清单与 skip 路径）
- README、架构图、图标等整文件覆盖素材在 `branding/overlay/`，按目标路径镜像存放
- `npm run brand:check`：在临时 worktree 套用品牌并扫描漂移，CI（brand-check.yml）每次 dev 更新后运行
- `npm run brand:publish`：从 dev 重建对外 `public` 分支（品牌态唯一落库处，永不手改、永不合并）
- 本地调试/打包需品牌态时，在临时 worktree 里执行 `node scripts/brand/apply.mjs`，禁止在主 checkout 直接套用

上游新增内容若含品牌词，`brand:check` 会以非零退出列出文件，按提示补充 rules / keep / overlay 即可。
