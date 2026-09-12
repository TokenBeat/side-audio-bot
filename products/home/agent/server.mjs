// 晚晴伴可替换后台 Agent：A2A 1.0 边界 + 后台 MCP 工具循环。
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
import { HomeAgentExecutor } from './executor.mjs'
import { HomeMcpTools } from './mcp-client.mjs'
import { DashScopeHomeModel } from './model.mjs'
import { loadHomeEnvironment } from '../bootstrap/environment.mjs'

function agentCard(origin) {
  return {
    name: '晚晴伴 Agent',
    description: 'Replaceable model-powered A2A Agent for home elder care.',
    supportedInterfaces: [{
      url: `${origin}/`,
      protocolBinding: 'JSONRPC',
      tenant: '',
      protocolVersion: A2A_PROTOCOL_VERSION,
    }],
    provider: {
      organization: 'WanQing Companion',
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
      id: 'home_care_operations',
      name: '居家关怀操作',
      description: '紧急求助升级、问安收尾、提醒确认。',
      tags: ['care', 'sos', 'checkin', 'reminder'],
      examples: ['救命', '药我吃过了', '今天聊到这吧'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json'],
      securityRequirements: [],
    }],
    documentationUrl: '',
    signatures: [],
  }
}

export async function startHomeAgentServer({
  host = '127.0.0.1',
  port = 3121,
  serviceOrigin = 'http://127.0.0.1:3111',
  homeId = 'default',
  tools = new HomeMcpTools({ origin: serviceOrigin, homeId }),
  model = new DashScopeHomeModel(),
} = {}) {
  const card = agentCard(`http://${host}:${port}`)
  const executor = new HomeAgentExecutor({ tools, model })
  const requestHandler = new DefaultRequestHandler(
    card,
    new InMemoryTaskStore(),
    executor,
  )
  const app = express()
  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'wanqing-home-agent', protocol: 'a2a' })
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
  loadHomeEnvironment()
  const runtime = await startHomeAgentServer({
    host: process.env.HOME_AGENT_HOST || '127.0.0.1',
    port: Number(process.env.HOME_AGENT_PORT) || 3121,
    serviceOrigin: process.env.HOME_SERVICE_ORIGIN || 'http://127.0.0.1:3111',
    homeId: process.env.HOME_ID || 'default',
  })
  console.log(`晚晴伴 Agent listening on ${runtime.origin}`)
  const close = async () => {
    await runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
