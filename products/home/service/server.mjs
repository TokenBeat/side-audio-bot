// 晚晴伴场景服务：向老人端/家属端投影状态，暴露前台/后台双面 MCP 工具。
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import {
  StreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { HomeService } from './home-service.mjs'
import { createHomeMcpServer } from './mcp-server.mjs'
import { loadHomeEnvironment } from '../bootstrap/environment.mjs'
import {
  BACKEND_TOOL_DEFINITIONS,
  FRONTEND_TOOL_DEFINITIONS,
} from './tools/registry.mjs'

const MAX_JSON_BYTES = 64 * 1024

function homeId(request, url, body = {}) {
  return String(
    request.headers['x-home-id']
    || url.searchParams.get('homeId')
    || body.homeId
    || 'default',
  )
}

function json(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  })
  response.end(body)
}

async function readJson(request) {
  let total = 0
  const chunks = []
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_JSON_BYTES) throw new Error('Request body is too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export class HomeServiceServer {
  constructor({
    service = new HomeService(),
    host = '127.0.0.1',
    port = 3111,
  } = {}) {
    this.service = service
    this.host = host
    this.port = port
    this.server = null
    this.sockets = new Set()
  }

  get origin() {
    if (!this.server?.listening) return null
    const address = this.server.address()
    return `http://${this.host}:${address.port}`
  }

  async start() {
    if (this.server?.listening) return this
    const server = createServer((request, response) => {
      this.#handle(request, response).catch(error => {
        if (!response.headersSent) json(response, 500, { error: error.message })
        else response.end()
      })
    })
    server.on('connection', socket => {
      this.sockets.add(socket)
      socket.once('close', () => this.sockets.delete(socket))
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(this.port, this.host, resolve)
    })
    this.server = server
    return this
  }

  async close() {
    if (!this.server) return
    this.service.close()
    const server = this.server
    this.server = null
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    await new Promise(resolve => server.close(resolve))
  }

  async #handle(request, response) {
    const url = new URL(request.url || '/', `http://${this.host}`)
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-home-id, mcp-protocol-version, mcp-session-id',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      })
      response.end()
      return
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      json(response, 200, { ok: true, service: 'wanqing-home-service' })
      return
    }
    if (url.pathname === '/api/home/state' && request.method === 'GET') {
      json(response, 200, this.service.snapshot(homeId(request, url)))
      return
    }
    if (url.pathname === '/api/home/events' && request.method === 'GET') {
      this.#events(request, response, homeId(request, url))
      return
    }
    if (url.pathname === '/api/home/commands' && request.method === 'POST') {
      const body = await readJson(request)
      const output = await this.service.execute(body.name, body.arguments || {}, {
        homeId: homeId(request, url, body),
      })
      json(response, 200, output)
      return
    }
    if (url.pathname === '/api/home/voice-touch' && request.method === 'POST') {
      const body = await readJson(request)
      this.service.touchVoice(homeId(request, url, body), body.notes)
      json(response, 200, { ok: true })
      return
    }
    if (url.pathname === '/api/home/simulate-checkin' && request.method === 'POST') {
      // 演示控制：手动触发一次问安（真实环境由每日定时调度调用 checkin_start）。
      const output = await this.service.execute('checkin_start', {}, {
        homeId: homeId(request, url),
      })
      json(response, 200, output)
      return
    }
    if (url.pathname === '/api/home/reset' && request.method === 'POST') {
      json(response, 200, this.service.reset(homeId(request, url, body ?? {})))
      return
    }
    const mcpSurface = url.pathname === '/mcp/frontend'
      ? 'frontend'
      : url.pathname === '/mcp/backend'
        ? 'backend'
        : null
    const mcpTools = mcpSurface === 'frontend'
      ? FRONTEND_TOOL_DEFINITIONS
      : mcpSurface === 'backend'
        ? BACKEND_TOOL_DEFINITIONS
        : null
    if (mcpTools && request.method === 'POST') {
      await this.#mcp(request, response, homeId(request, url), mcpTools, mcpSurface)
      return
    }
    if (mcpTools) {
      json(response, 405, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Method not allowed' },
      })
      return
    }
    json(response, 404, { error: 'Not found' })
  }

  #events(request, response, id) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    const send = (type, value) => {
      response.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`)
    }
    send('snapshot', this.service.snapshot(id))
    const unsubscribeState = this.service.subscribe(id, event => send('state', event))
    const unsubscribeActivity = this.service.subscribeActivity(
      id,
      event => send('activity', event),
    )
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000)
    heartbeat.unref?.()
    request.once('close', () => {
      clearInterval(heartbeat)
      unsubscribeState()
      unsubscribeActivity()
    })
  }

  async #mcp(request, response, id, tools, surface) {
    const server = createHomeMcpServer({
      service: this.service,
      homeId: id,
      tools,
      surface,
    })
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    response.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(request, response)
  }
}

export async function startHomeServiceServer(options = {}) {
  const runtime = new HomeServiceServer(options)
  await runtime.start()
  return runtime
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadHomeEnvironment()
  const runtime = await startHomeServiceServer({
    host: process.env.HOME_SERVICE_HOST || '127.0.0.1',
    port: Number(process.env.HOME_SERVICE_PORT) || 3111,
  })
  console.log(`晚晴伴 Service listening on ${runtime.origin}`)
  const close = async () => {
    await runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
