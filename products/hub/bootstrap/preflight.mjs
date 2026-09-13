// 晚晴·家中控启动预检。
import { loadHubEnvironment } from './environment.mjs'

loadHubEnvironment()

const problems = []

const provider = String(process.env.QWEN_AUDIO_REALTIME_PROVIDER || 'dashscope').trim()
if (provider === 'dashscope' && !String(process.env.DASHSCOPE_API_KEY || '').trim()) {
  problems.push('缺少 DASHSCOPE_API_KEY。请在 products/hub/.env.local 中填写（复制 .env.example）。')
}

if (problems.length) {
  console.error('晚晴·家无法启动：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('晚晴·家预检通过 ✓  中控屏: /  远程控制: /remote')
