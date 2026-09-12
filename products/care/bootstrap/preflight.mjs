// 晚晴·照护启动预检：任何必需配置缺失就立刻失败，不发出残缺的演示环境。
import { existsSync } from 'node:fs'
import { loadCareEnvironment } from './environment.mjs'

loadCareEnvironment()

const problems = []

const provider = String(process.env.QWEN_AUDIO_REALTIME_PROVIDER || 'dashscope').trim()
if (provider === 'dashscope') {
  if (!String(process.env.DASHSCOPE_API_KEY || '').trim()) {
    problems.push('缺少 DASHSCOPE_API_KEY。请在 products/care/.env.local 中填写（复制 .env.example）。')
  }
} else if (provider === 'speech-to-speech') {
  if (!String(process.env.SPEECH_TO_SPEECH_REALTIME_URL || '').trim()) {
    problems.push('前台 provider 为 speech-to-speech 时必须配置 SPEECH_TO_SPEECH_REALTIME_URL。')
  }
}

const gatewayPort = Number(process.env.CARE_GATEWAY_PORT) || 18_890
const servicePort = Number(process.env.CARE_SERVICE_PORT) || 3_110
const agentPort = Number(process.env.CARE_AGENT_PORT) || 3_120
const clientPort = Number(process.env.CARE_CLIENT_PORT) || 5_175
for (const [name, port] of [['Gateway', gatewayPort], ['Service', servicePort], ['Agent', agentPort], ['Client', clientPort]]) {
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    problems.push(`${name} 端口配置无效：${port}`)
  }
}

if (!existsSync(new URL('../service/server.mjs', import.meta.url))) {
  problems.push('care/service 不完整，请确认在 product/wanqing 分支上。')
}

if (problems.length) {
  console.error('晚晴·照护无法启动：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('晚晴·照护预检通过 ✓  大屏: /station  房间终端: /room/302  家属端: /family')
