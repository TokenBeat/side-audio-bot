// 晚晴伴启动预检。
import { loadHomeEnvironment } from './environment.mjs'

loadHomeEnvironment()

const problems = []

const provider = String(process.env.QWEN_AUDIO_REALTIME_PROVIDER || 'dashscope').trim()
if (provider === 'dashscope' && !String(process.env.DASHSCOPE_API_KEY || '').trim()) {
  problems.push('缺少 DASHSCOPE_API_KEY。请在 products/home/.env.local 中填写（复制 .env.example）。')
}

if (problems.length) {
  console.error('晚晴伴无法启动：')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('晚晴伴预检通过 ✓  老人端: /elder  家属端: /family')
