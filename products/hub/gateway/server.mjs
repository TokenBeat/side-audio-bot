// 晚晴·家前台组合根。场景选择保留在这里，只消费 qwen-audio-agent 公开导出；
// 不复制框架运行时逻辑，不把照护业务状态搬进 Gateway。
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadHubEnvironment } from '../bootstrap/environment.mjs'
import { writeHubFrontendProfileBundle } from './profile-bundle.mjs'

loadHubEnvironment()
process.env.QWAUDIO_CONFIG_DIR ||= fileURLToPath(new URL('../.runtime', import.meta.url))
if (!process.env.QWEN_AUDIO_REALTIME_PROVIDER) {
  process.env.QWEN_AUDIO_REALTIME_PROVIDER = 'dashscope'
}
if (!process.env.HUB_FRONTEND_MCP_URL) {
  const frontendMcpUrl = new URL(
    '/mcp/frontend',
    process.env.HUB_SERVICE_ORIGIN || 'http://127.0.0.1:3112',
  )
  frontendMcpUrl.searchParams.set('hubId', process.env.HUB_ID || 'default')
  process.env.HUB_FRONTEND_MCP_URL = frontendMcpUrl.toString()
}
process.env.QWEN_AUDIO_FRONTEND_PROFILE ||= writeHubFrontendProfileBundle({
  root: process.env.QWAUDIO_CONFIG_DIR,
  frontendMcpUrl: process.env.HUB_FRONTEND_MCP_URL,
})

const [
  { createGatewayApplication },
  { createBackendAgentHost },
  { createA2ABackendAdapter },
] = await Promise.all([
  import('qwen-audio-agent/gateway-application'),
  import('qwen-audio-agent/backend-adapter-sdk'),
  import('qwen-audio-agent/a2a-backend-adapter'),
])

function port(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65_535
    ? parsed
    : fallback
}

export async function waitForHubService({
  origin = process.env.HUB_SERVICE_ORIGIN || 'http://127.0.0.1:3112',
  timeoutMs = 8_000,
  intervalMs = 100,
  fetchImpl = fetch,
} = {}) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(new URL('/health', origin))
      if (response.ok) return
      lastError = new Error(`Hub Service health returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Hub Service is not ready: ${lastError?.message || origin}`)
}

export function startHubGateway({
  host = process.env.HUB_GATEWAY_HOST || '127.0.0.1',
  port: listenPort = port(process.env.HUB_GATEWAY_PORT, 18_890),
  agentCardUrl = process.env.HUB_AGENT_CARD_URL
    || 'http://127.0.0.1:3122/.well-known/agent-card.json',
} = {}) {
  const backend = createA2ABackendAdapter({
    agentCardUrl,
    label: '晚晴·家 Agent',
  })
  const agent = createBackendAgentHost(backend, {
    name: '晚晴·家 A2A Agent',
  })
  const application = createGatewayApplication({
    agent,
    autoStart: false,
  })
  const server = application.start({ host, port: listenPort })
  let closePromise = null

  return {
    application,
    agent,
    server,
    close() {
      if (closePromise) return closePromise
      closePromise = (async () => {
        try {
          await application.close()
        } finally {
          await agent.close()
        }
      })()
      return closePromise
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await waitForHubService()
  const runtime = startHubGateway()
  runtime.server.once('listening', () => {
    const address = runtime.server.address()
    console.log(`晚晴·家 Gateway listening on http://${address.address}:${address.port}`)
  })
  const close = async () => {
    await runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
