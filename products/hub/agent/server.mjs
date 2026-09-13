// 晚晴·家可替换后台 Agent：A2A 1.0 边界 + 后台 MCP 工具循环。
// 客户的 A2A/ACP/自定义后台可直接替换本服务，Gateway 与终端不感知。
import {
  A2A_PROTOCOL_VERSION,
  AGENT_CARD_PATH,
} from '@a2a-js/sdk'
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from '@a2a-js/sdk/server'
import {
  UserBuilder,
  agentCardHandler,
  jsonRpcHandler,
} from '@a2a-js/sdk/server/express'
import express from 'express'
import { pathToFileURL } from 'node:url'
import { HubAgentExecutor } from './executor.mjs'
import { HubMcpTools } from './mcp-client.mjs'
import { DashScopeHubModel } from './model.mjs'
import { loadHubEnvironment } from '../bootstrap/environment.mjs'

function agentCard(origin) {
  return {
    name: '晚晴·家 Agent',
    description: 'Replaceable model-powered A2A Agent for elder-hub operations.',
    supportedInterfaces: [{
      url: `${origin}/`,
      protocolBinding: 'JSONRPC',
      tenant: '',
      protocolVersion: A2A_PROTOCOL_VERSION,
    }],
    provider: {
      organization: 'WanQing Care',
      url: 'https://wanqing.example.com',
    },
    version: '0.1.0',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false,
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [{
      id: 'hub_operations',
      name: '全屋联动',
      description: '多步全屋联动编排：睡前检查、离家确认、设备组合操作。',
      tags: ['hub', 'automation', 'scene', 'device'],
      examples: ['我要喝水', '我腰疼', '药我吃过了', '帮我报手工课'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json'],
      securityRequirements: [],
    }],
    documentationUrl: '',
    signatures: [],
  }
}

export async function startCareAgentServer({
  host = '127.0.0.1',
  port = 3120,
  serviceOrigin = 'http://127.0.0.1:3112',
  hubId = 'default',
  tools = new HubMcpTools({ origin: serviceOrigin, hubId }),
  model = new DashScopeHubModel(),
} = {}) {
  const card = agentCard(`http://${host}:${port}`)
  const executor = new HubAgentExecutor({ tools, model })
  const requestHandler = new DefaultRequestHandler(
    card,
    new InMemoryTaskStore(),
    executor,
  )
  const app = express()
  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'wanqing-hub-agent', protocol: 'a2a' })
  })
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({
    agentCardProvider: requestHandler,
  }))
  app.use(jsonRpcHandler({
    requestHandler,
    userBuilder: UserBuilder.noAuthentication,
  }))
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener))
    listener.once('error', reject)
  })
  const address = server.address()
  const origin = `http://${host}:${address.port}`
  card.supportedInterfaces[0].url = `${origin}/`
  return {
    app,
    server,
    origin,
    agentCardUrl: `${origin}/${AGENT_CARD_PATH}`,
    close: async () => {
      await tools.close?.()
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
      })
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadHubEnvironment()
  const runtime = await startCareAgentServer({
    host: process.env.HUB_AGENT_HOST || '127.0.0.1',
    port: Number(process.env.HUB_AGENT_PORT) || 3122,
    serviceOrigin: process.env.HUB_SERVICE_ORIGIN || 'http://127.0.0.1:3112',
    hubId: process.env.HUB_ID || 'default',
  })
  console.log(`晚晴·家 Agent listening on ${runtime.origin}`)
  const close = async () => {
    await runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
