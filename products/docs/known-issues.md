# 已知问题与技术备忘（开发笔记）

## 产品约束（重要）

### 1. 同一 Gateway 同时只支持一个实时语音客户端
框架当前是单实时会话模型：第二个语音客户端连接会被拒（close code 4002 occupied）。
- 对演示：一次只开一个房间的终端即可；护理站大屏不走语音，无冲突。
- 对机构版量产：多房间并行语音是**硬需求**，需要框架支持多 session（二期评估）。
- 居家版不受影响（一个家一个老人终端）。

### 2. 浏览器自动播放策略限制问安自动唤起
问安到点时终端自动 activateVoice 需要浏览器用户激活态；页面刚打开未交互时麦克风
与 AudioContext 会被浏览器拦截。演示时先点一次页面任意处即可。真机 App（Capacitor）
无此限制。

## 踩坑记录（框架集成）

### A2A 1.0 请求格式
- 方法名是 **`SendMessage`**（`message/send` 是 0.3 遗留名，1.0 里会报 Invalid method）
- 必须带请求头 **`A2A-Version: 1.0`**，否则按 0.3 协商、被 agent 卡（只声明 1.0）拒绝（-32009）
- 1.0 的 message parts 是扁平结构 `{text, mediaType}`，不是 0.3 protobuf JSON 的 `{$case:'text', value}` 包装

### Node 包解析：products/ 目录的包自引用断裂
框架内部用 Node 的 **package self-reference**（根 package.json name=qwen-audio-agent）。
在 examples/ 下（无中间 package.json）自引用可达；但 products/package.json 的存在
把最近 package.json 切断为 wanqing-products，自引用失效。
解法：care/gateway、care/client 等需要框架包的子工程各自声明
`"qwen-audio-agent": "file:../../.."` 并安装（产生 node_modules 符号链接）。

### 本地测试环境对框架测试的干扰
本机 `~/.config/qwaudio/config.env` 配置了 `QWEN_AUDIO_REALTIME_PROVIDER=speech-to-speech`，
会让框架部分默认 dashscope 的测试在本地失败（`gateway-client-handshake.test.mjs` 的
output_voice 用例）。跑框架测试用：
`QWEN_AUDIO_REALTIME_PROVIDER=dashscope npm test`。
产品运行时不受影响（QWAUDIO_CONFIG_DIR 已隔离到 products/<x>/.runtime）。

### 本地 Node 版本
本机 v24.6.0 低于框架 engines 要求的 `^24.15.0`（仅警告，未阻断）。

## 待办（打磨期）

- [ ] 护理员工单卡片在「escalated」时声音告警与更大视觉
- [ ] 家属端远程对话（一期同屏模拟的真正实现）
- [ ] 交接班摘要与响应统计报表
- [ ] VoiceMem 记忆接入（替代默认 markdown provider）
- [ ] 多房间语音并行（依赖框架多 session）
- [ ] DashScope 免费额度耗尽会影响记忆提炼与后台 Agent LLM——演示前确认额度
