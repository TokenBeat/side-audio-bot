// 晚晴伴前台组合根。只消费 qwen-audio-agent 公开导出；照护业务状态留在 service。
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadHomeEnvironment } from '../bootstrap/environment.mjs'
import { writeHomeFrontendProfileBundle } from './profile-bundle.mjs'

loadHomeEnvironment()
process.env.QWAUDIO_CONFIG_DIR ||= fileURLToPath(new URL('../.runtime', import.meta.url))
if (!process.env.QWEN_AUDIO_REALTIME_PROVIDER) {
  process.env.QWEN_AUDIO_REALTIME_PROVIDER = 'dashscope'
}
if (!process.env.HOME_FRONTEND_MCP_URL) {
  const frontendMcpUrl = new URL(
    '/mcp/frontend',
    process.env.HOME_SERVICE_ORIGIN || 'http://127.0.0.1:3111',
  )
  frontendMcpUrl.searchParams.set('homeId', process.env.HOME_ID || 'default')
  process.env.HOME_FRONTEND_MCP_URL = frontendMcpUrl.toString()
}
process.env.QWEN_AUDIO_FRONTEND_PROFILE ||= writeHomeFrontendProfileBundle({
  root: process.env.QWAUDIO_CONFIG_DIR,
  frontendMcpUrl: process.env.HOME_FRONTEND_MCP_URL,
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

export async function waitForHomeService({
  origin = process.env.HOME_SERVICE_ORIGIN || 'http://127.0.0.1:3111',
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
      lastError = new Error(`Home Service health returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Home Service is not ready: ${lastError?.message || origin}`)
}

export function startHomeGateway({
  host = process.env.HOME_GATEWAY_HOST || '127.0.0.1',
  port: listenPort = port(process.env.HOME_GATEWAY_PORT, 18_891),
  agentCardUrl = process.env.HOME_AGENT_CARD_URL
    || 'http://127.0.0.1:3121/.well-known/agent-card.json',
} = {}) {
  const backend = createA2ABackendAdapter({
    agentCardUrl,
    label: '晚晴伴 Agent',
  })
  const agent = createBackendAgentHost(backend, {
    name: '晚晴伴 A2A Agent',
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
  await waitForHomeService()
  const runtime = startHomeGateway()
  runtime.server.once('listening', () => {
    const address = runtime.server.address()
    console.log(`晚晴伴 Gateway listening on http://${address.address}:${address.port}`)
  })
  const close = async () => {
    await runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
