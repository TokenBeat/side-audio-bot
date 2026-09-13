# 晚晴系列 · 开发交接文档（写给下一个智能体/工程师）

> 读这份文档的前提：你要在「晚晴」系列上继续开发。它会告诉你一切需要的上下文：
> 这是什么、怎么跑、已经做了什么、验证过什么、坑在哪、接下来做什么。
> 本文档自包含；`products/docs/` 里的其他文档是它的展开。

---

## ⭐ 当前主任务（先做这个）

**继续开发功能，并把三个产品的 UI 打磨到"大厂出品"的水准——对标物就是本仓库的智能座舱
（`examples/smart-cockpit/client`）。当前界面是"能用+干净"，距离座舱的工艺还差一口气，
你的任务就是把这一口气补上，然后再往上走。**

### 对标基准怎么建立

动手写任何 UI 代码之前，先把座舱跑起来逐屏研究（5173 常被别的项目占用，换端口）：

```bash
cd <仓库根> && COCKPIT_CLIENT_PORT=5180 npm run example:smart-cockpit:client
# 打开 http://localhost:5180，截图，对照下面的工艺拆解表
```

### 座舱工艺拆解（我们已经做到 / 还差什么 / 你要做什么）

| 工艺要素 | 座舱的做法 | 当前晚晴状态 | 你要做的 |
| --- | --- | --- | --- |
| 3D 主视觉 | CarModel3D：three.js 车模，光影材质细腻，可交互 | care/home 有 3D 陪伴球（材质偏简单）；hub 无 3D | 球体材质升级（次表面散射感/环境贴图）；hub 加 3D 户型或设备主视觉 |
| 图标体系 | 定制 SVG 图标，线面一致、粗细统一 | **全部是 emoji——这是当前最廉价的观感来源，必须换掉** | 引入统一图标库（lucide-react 或 iconify 的 tabler），制定尺寸/描边规范 |
| 状态可视化 | 语音声波、速度表、导航路线动画 | 呼吸圈/迷你趋势图有了；缺声波条、设备动画（空调风叶转动、窗帘开合过程） | 每类设备/状态都有专属动效：音量波形条、窗帘开合动画、空调出风粒子 |
| 布局纵深 | 设备框+悬浮面板+地图三层纵深 | 设备框+玻璃卡（两层） | 增加：主视觉后景微动粒子/渐变光晕，面板悬浮投影分层 |
| 圆形 Dock | 大圆钮+胶囊播放器+彩色功能圆钮混排 | 有（样式偏平） | 加：按压回弹、悬停浮起、激活光晕；Dock 胶囊化音乐/媒体 |
| 空状态/加载态 | 每个面板有优雅的空态 | 部分是裸文本 | 全部补：骨架屏/呼吸占位/空态插画 |
| 数字与字体 | 超大细体数字、tabular-nums | 时钟做到了 | 全产品统一字体栈+数字变体；标题考虑思源黑体可变字重 |
| 主题纵深 | 浅色为主，局部深色对比 | care 浅色 + station 深色（割裂感） | 统一亮暗两套 token，大屏与终端可一键切换同主题 |

### 反模式清单（出现任何一条即视为不达标）

- ❌ emoji 当功能图标（可以当点缀，不能当 icon）
- ❌ 纯色平铺卡片、无 hover/active/过渡（≥120ms 缓动）
- ❌ 加载/空态缺失（数据未到时白屏或裸字）
- ❌ 圆角/间距/阴影不成体系（必须走 CSS token）
- ❌ 交互无反馈（点击、语音识别中、成功、失败都要有可见+可听反馈）
- ❌ 两套页面风格割裂（三个产品的 token 必须同源）

### 验收标准

把三个产品的截图拿给一个不知情的人看，ta 应该认为这是**某大厂车载/智能家居团队**的产品，
而不是开源 demo。自审流程：开发 → 浏览器截图（§6）→ 与座舱截图并排对比 → 找出 3 处差距 →
修 → 再截，每个界面至少迭代 3 轮。UI 改动用浏览器自动化自审，不要只看代码。

### 功能开发方向（与 UI 打磨并行）

- care：床位平面图主视觉、护理员手持端、交班文书语音录入、健康趋势图表化
- home：家属留言录音播放（真音频）、周报图表、Capacitor 真机
- hub：真实设备协议接入（Matter/米家 bridge）、天气与能耗面板、传感器历史曲线
- 全系列：统一主题切换（亮/暗）、无障碍（对比度/字号档位）

---

## 0. 一句话背景

仓库 `TokenBeat/side-audio-bot`（本地路径通常是 `~/repos/source/side-audio-bot`）是一个实时语音
Agent 框架（内部名 qwen-audio-agent，对外品牌 Side Audio Bot）。框架之上已有一个官方示范垂直
`examples/smart-cockpit`（智能座舱）。我们照同样的范式做了**康养产品系列「晚晴」**，三个垂直产品，
全部可运行、已实测。

**产品哲学**：老人不一定看得清字，所以一切提醒/反馈**必须语音主动开口**；家属和机构要能
**看到老人的全貌**（健康、生活、喜好），并能把照护的心**注入**进去（点歌、语音提醒、留言）。

## 1. 硬约束（先读，违者返工）

1. **分支纪律**：所有晚晴代码在 `product/wanqing` 分支（已推送 origin）。**绝不进 `dev`**——
   dev 的任何提交会在下次发版时被 brand 流水线重建进公开的 `public` 分支。
2. **分层纪律**：只 import `qwen-audio-agent/*` 的公开导出（gateway-application、
   gateway-client-sdk、realtime-events、gateway-client-protocol、backend-adapter-sdk、
   a2a-backend-adapter）。不复制框架内部实现；框架缺陷记 `known-issues.md`，通用能力反哺上游。
3. **包解析陷阱**：`products/` 的中间 package.json 切断了 Node 包自引用（仓库根 name=
   qwen-audio-agent）。任何需要框架包的子工程，package.json 必须声明
   `"qwen-audio-agent": "file:../../.."` 并安装（client 和 gateway 都是这么做的）。
4. **环境隔离**：每个产品进程启动时 `QWAUDIO_CONFIG_DIR=products/<x>/.runtime`（bootstrap 里
   `||=` 设置），否则会读到开发者本机 `~/.config/qwaudio/config.env`（那台机器上配了
   speech-to-speech，会污染 provider 选择）。`.env.local`（gitignore）放
   `DASHSCOPE_API_KEY` 与 `QWEN_AUDIO_REALTIME_PROVIDER=dashscope`。
5. **单实时客户端**：框架一个 Gateway 同时只允许一个实时语音客户端，第二个被拒
   （close code 4002 occupied）。测试时别开两个终端页面；机构版多房间并行语音是二期框架需求。
6. **Node 版本**：本机 v24.6.0 低于 engines `^24.15.0`（仅警告）；跑框架自带测试需
   `QWEN_AUDIO_REALTIME_PROVIDER=dashscope npm test`（否则一个 handshake 用例会因本地配置失败）。
7. **DashScope 额度**：后台 Agent 的 qwen3.8-flash 与记忆提炼走 DashScope 文本模型——
   某些 key 的免费额度已耗尽（报 403 AllocationQuota.FreeTierOnly）。演示前确认额度，
   或在 `.env.local` 换 `DASHSCOPE_MODEL`。

## 2. 怎么跑（一台 Mac 全部起）

```bash
cd ~/repos/source/side-audio-bot
git switch product/wanqing
npm ci                                    # 根依赖（框架）
cd products && npm install                # concurrently
npm run care:install && npm run home:install && npm run hub:install   # 各产品子包

npm run care   # 机构版：gateway:18890 service:3110 agent:3120 client:5175
npm run home   # 居家版：gateway:18891 service:3111 agent:3121 client:5176
npm run hub    # 中控：  gateway:18892 service:3112 agent:3122 client:5177
```

页面：care → `/station` 大屏、`/room/302` 房间终端、`/family` 家属端；
home → `/elder` 老人端、`/family` 家属端；hub → `/` 中控屏、`/remote` 远程页。
语音用 DashScope 实时（浏览器点语音按钮→允许麦克风→直接说话）。

## 3. 架构范式（三个产品完全同构，改业务不改骨架）

每个垂直 = 四进程，模板是 `examples/smart-cockpit`，**先读它的同名文件再动手**：

```
gateway/server.mjs   组合根：createGatewayApplication + A2A 后台适配器 + 前台 profile bundle
service/             场景服务：状态存储(state-store) + 业务执行(hub/care/home-service)
                     + MCP 双面挂载(/mcp/frontend 前台低延迟 /mcp/backend 后台编排)
                     + HTTP API(/api/x/state 快照, /api/x/events SSE, /api/x/commands)
agent/               可替换后台 Agent：A2A 1.0 + OpenAI SDK(qwen3.8-flash) + MCP 工具循环
client/              React+Vite：GCP 语音(useVoiceSession) + SSE 状态(useXState) + 业务视图
bootstrap/           环境装载(.env.local 只填未定义变量) + preflight(缺配置即退出)
```

**surface routing**（`service/tools/registry.mjs`）决定域走前台还是后台：
前台=实时模型直接调（低延迟），后台=A2A Agent 编排（复杂任务）。
前台工具通过 gateway 的 frontend profile bundle（`gateway/profile-bundle.mjs` 生成 JSON 写入
.runtime，设 `QWEN_AUDIO_FRONTEND_PROFILE`）挂到实时会话。

**语音播报机制**（重要设计决策）：框架目前没有"服务端主动让助手说话"的通道（effects 白名单
只有 setAssistantProfile）。产品的主动播报（提醒到点、呼叫反馈、家属注入、起夜联动）走
**客户端 speechSynthesis**（`client/src/audio/announceSpeech.js`）：service 发 SSE 活动/状态事件 →
终端监听 → `speak(text)`。 zh-CN 系统音、rate 0.92。助手真声只用于对话应答。
→ 上游机会：给框架加服务端 speak 通道，产品侧即可统一音色。

## 4. 三个产品的现状（已完成 ✅ / 待办 ⬜）

### 4.1 晚晴·照护（机构版，`products/care/`）

场景：养老院 3 楼六间房，6 位老人种子数据。**核心资产 = 健康数据监测 + 呼叫工单闭环。**

✅ 已完成（全部实测）：
- 房间终端 `/room/:id`：3D 陪伴球（three.js，音频呼吸）、用药提醒（到点语音催+口头确认）、
  一键呼叫（三段式反馈：已知道→已告诉小李→小李正在过来，每步开口说）、
  今日健康卡（四体征色阶 + 7 天血压趋势 SVG 迷你图）、设备心跳（10s，30s 判离线）
- 护理站大屏 `/station`：房间网格（平安/呼叫红闪/提醒琥珀/离线）+ 体征芯片（异常红显）+
  呼叫队列（等待进度条、受理/完成按钮）+ 健康预警面板（安排复查→自动生成工单）+ 响应统计
- 呼叫工单状态机：new→accepted→done；3 分钟无受理自动 escalated（升级护士长）
- 健康数据：每人每日血压/血糖/心率/血氧，阈值评估（血压≥140/90 等），多日趋势；
  语音工具 `vitals_query`（"我血压怎么样"）/ `vitals_record`（"记一下血压 158 94"，异常自动预警）
- 家属端 `/family`：全貌仪表盘（体征卡+今日生活餐饮活动+喜好 chips）+ 照护注入
- 照护注入三通道（已实测）：`/api/care/family/{media,reminder,message}` → SSE → 终端开口转达
  （"女儿小芳为您点了豫剧选段"），音乐状态联动显示
- A2A 后台 Agent：真实 LLM 工具循环实测（"我腰疼"→call_manage→工单）

⬜ 待办：护理员语音交班文书（B2B 卖点，-28% 文书时间）、排班管理、报表、床位平面图视图、
VoiceMem 记忆接入、对接真实护理信息系统。

### 4.2 晚晴伴（居家版，`products/home/`）

场景：独居老人张秀兰 + 女儿小雨/儿子小林。**核心资产 = 主动问安 + SOS 升级链路。**

✅ 已完成（全部实测）：
- 老人端 `/elder`：同工艺终端（3D 球/提醒/SOS 长按 1.2s 防误触）、问安到点自动响起
  （服务端 checkin 状态 → 终端自动开麦 + 日出横幅 + 时间感知问候）、家属留言/点歌接收
- SOS 升级状态机：触发→通知一级联系人→30 秒未确认→自动升级二级→全程时间线落库；
  家属确认后终端显示"小雨已经看到了"（实测含自动升级）
- 家属端 `/family`：全貌主卡（体征三项+问安状态+提醒完成度+紧急联系人）、喜好点歌、
  语音提醒、留言、SOS 红幅强提醒+确认按钮、演示触发问安按钮
- 家属注入 API 同机构版（/api/home/family/*）

⬜ 待办：电话外呼（SIP，问安打到老人手机）、声学异常感知、周报、真机 App（Capacitor）。

### 4.3 晚晴·家（家庭智能中控，`products/hub/`）

场景：全屋设备中控屏（客厅/卧室/厨房，灯/空调/窗帘/电视/夜灯/门磁/人体传感器）+ 远程页。

✅ 已完成：
- 中控屏 `/`：户型图（FloorPlan，房间分区+设备图标+选中高亮+联动暖光）、设备面板
  （亮度滑条/空调温度/窗帘/开关）、传感与联动卡（室温湿度门窗+两个演示联动按钮）、
  语音条（整条可点、激活态、错误显性提示含麦克风权限恢复指引）
- 场景：回家/观影/我睡了/起夜/离家（scene_activate 批量动作+语音反馈"已为你切换到XX场景"）
- **起夜联动**（实测闭环）：`motion(forceNight:true)` → 检测活动 → 点亮夜灯(45%) →
  动态+预警 → 中控开口播报。注意 `hub-service.mjs` 必须透传 options 给 store（曾吞参）
- 远程页 `/remote`：手机形态，与中控同源同协议（生产走设备凭证+Tailscale）

⬜ 待办：接入真实智能家居（Matter/米家 bridge）、夜灯自动延时熄灭、更多传感器联动
（摄像头/床垫）、语音多轮设备对话。

## 5. 设计语言（改 UI 前必读，全产品一致）

对标座舱工艺：**浅色悬浮设备框**（大圆角+软阴影，App 悬在渐变桌面）、**玻璃卡片**、
**超大细体时钟**（96px font-weight 200）、**圆形 Dock**、克制软阴影。

三色语义全产品一致：**绿=平安/正常，红=呼叫/紧急，琥珀=提醒/注意**。
主色晨光橙 `#e8722a`。老人端正文 ≥20px、按钮 ≥88px、图标+文字+颜色三重编码、动效慢呼吸不闪烁。
文案守则：称呼"您"、不出现"工单/系统"等术语（对老人说"已经告诉护理员了"）、
错误不说"失败"、语音回复 ≤2 句。详见 `docs/01-命名与品牌.md`。

## 6. 验证手册（改完必跑）

```bash
# 1. 后端闭环（不依赖浏览器/麦克风）
curl -X POST localhost:3110/api/care/commands -H 'Content-Type: application/json' \
  -d '{"name":"call_manage","arguments":{"action":"create","roomId":"302","intent":"我想喝水"}}'
# 期望：返回"已经告诉小李了…"，state 里 302 变 calling，大屏 SSE 收到
curl -X POST localhost:3112/api/hub/motion -H 'Content-Type: application/json' \
  -d '{"room":"卧室","forceNight":true}'
# 期望：announced="检测到卧室有活动，已为你点亮夜灯"，夜灯 on=true

# 2. 语音链路（文本模拟，验证 模型→工具→状态）
cd products/hub/client && node --input-type=module -e "
import { GatewayClient } from 'qwen-audio-agent/gateway-client-sdk'
import { GatewayClientCapability } from 'qwen-audio-agent/gateway-client-protocol'
import { GatewayClientEvent } from 'qwen-audio-agent/realtime-events'
const client = new GatewayClient({
  url: 'ws://127.0.0.1:18892/api/realtime?sessionId=t', createSocket: u => new WebSocket(u),
  clientType: 'web', clientVersion: '2.0.0', clientInstanceId: 't', clientLabel: 't',
  capabilities: [GatewayClientCapability.INPUT_TEXT, GatewayClientCapability.PLAYBACK_RECEIPTS],
  locale: 'zh-CN', timeZone: 'Asia/Shanghai',
  configure: () => ({ textOnly: true, inputEnabled: false, outputEnabled: true }),
  onEvent: e => { if (e.content) console.log('[转写]', e.role, e.content) },
})
client.start()
await new Promise(r => setTimeout(r, 1500))
client.send({ type: GatewayClientEvent.INPUT_MESSAGE, parts: [{ type: 'text', text: '打开客厅灯' }] })
await new Promise(r => setTimeout(r, 15000))
process.exit(0)"

# 3. 语音播报验证（浏览器拦截法）：页面 evaluate 里包一层
#    speechSynthesis.speak 记录 utterance.text 到 window.__spoken，触发事件后读回。

# 4. 视觉：截图对比设计语言（设备框/玻璃卡/三色语义/大字）
```

## 7. 排坑实录（都是踩过的，省你半天）

| 坑 | 症状 | 解法 |
| --- | --- | --- |
| A2A 1.0 协议 | `message/send` 报 Invalid method；无头请求报 -32009 | 方法名用 `SendMessage`，带头 `A2A-Version: 1.0`，parts 是扁平 `{text}` 非 `{$case}` |
| 包自引用断裂 | products/ 下 `Cannot find package 'qwen-audio-agent'` | 子工程 package.json 加 `"qwen-audio-agent": "file:../../.."` 并安装 |
| now() 是函数 | `now().toISOString is not a function` | 它返回数字：`new Date(now())` |
| 中间层吞参 | endpoint 传了 option 但 store 收不到 | 检查 service 层方法签名是否透传（hub-service.motion 踩过） |
| 单客户端 | 第二语音端点被 4002 拒 | 框架设计；测试时只开一个语音页面 |
| 麦克风权限 | 点语音没反应 | 需用户手势+允许权限；拒绝后要去地址栏 🔒 重允许；错误必须显性提示 |
| 本地配置污染 | 框架测试/output_voice 用例本地挂 | `QWEN_AUDIO_REALTIME_PROVIDER=dashscope npm test`；产品运行时用 .runtime 隔离 |
| StrictMode 双挂载 | 短暂 connected→replaced 抖动 | 无害，第二挂载存活；别在 effect 里做不可重入操作 |
| SPM 缓存损坏 | iOS 构建 `already exists in file system` | 删项目 derivedData 的 SourcePackages 重试 |

## 8. 路线图（建议顺序）

1. **UI 大厂化冲刺**（⭐ 主任务）：按上面的拆解表逐项落地，三个产品全部过验收标准
2. **真人语音验收 + 录 demo**（演示脚本在 docs/03、04 尾部；界面到位后再录，效果翻倍）
3. **找一家民办养老院试点**：护理交班文书 + 房间终端 + 护理站大屏（产品侧已就绪，成败在场景）
4. 机构版：护理员手持工单、交班文书、报表图表
5. 居家版：电话外呼问安、Capacitor 真机、VoiceMem 记忆
6. 中控：接真实智能家居协议
7. 框架反哺：服务端主动 speak 通道、多实时客户端

## 9. 文件地图

```
products/
├── docs/            ← 你在这里：HANDOFF（本文）/ KICKOFF（开场提示词模板）/
│                      00 总览 / 01 品牌 / 02 需求 / 03·04 产品设计 / 05 架构 / known-issues
├── care/  home/  hub/    # 三个垂直，目录结构同构（见 §3）
├── package.json     # npm run care|home|hub（含 :install/:preflight）
└── .gitignore       # node_modules/.env.local/.runtime/dist
```

约定：提交只进 `product/wanqing`；每次改动跑 §6 验证手册对应项；文案改动对照 §5 设计语言。
