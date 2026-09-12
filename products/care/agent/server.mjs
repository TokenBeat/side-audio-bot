// 晚晴·照护可替换后台 Agent：A2A 1.0 边界 + 后台 MCP 工具循环。
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
import { CareAgentExecutor } from './executor.mjs'
import { CareMcpTools } from './mcp-client.mjs'
import { DashScopeCareModel } from './model.mjs'
import { loadCareEnvironment } from '../bootstrap/environment.mjs'

function agentCard(origin) {
  return {
    name: '晚晴·照护 Agent',
    description: 'Replaceable model-powered A2A Agent for elder-care operations.',
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
      id: 'care_operations',
      name: '照护操作',
      description: '老人呼叫工单、用药确认、活动报名与房间状态查询。',
      tags: ['care', 'call', 'medication', 'activity'],
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
  serviceOrigin = 'http://127.0.0.1:3110',
  careId = 'default',
  tools = new CareMcpTools({ origin: serviceOrigin, careId }),
  model = new DashScopeCareModel(),
} = {}) {
  const card = agentCard(`http://${host}:${port}`)
  const executor = new CareAgentExecutor({ tools, model })
  const requestHandler = new DefaultRequestHandler(
    card,
    new InMemoryTaskStore(),
    executor,
  )
  const app = express()
  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'wanqing-care-agent', protocol: 'a2a' })
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
  loadCareEnvironment()
  const runtime = await startCareAgentServer({
    host: process.env.CARE_AGENT_HOST || '127.0.0.1',
    port: Number(process.env.CARE_AGENT_PORT) || 3120,
    serviceOrigin: process.env.CARE_SERVICE_ORIGIN || 'http://127.0.0.1:3110',
    careId: process.env.CARE_ID || 'default',
  })
  console.log(`晚晴·照护 Agent listening on ${runtime.origin}`)
  const close = async () => {
    await runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
