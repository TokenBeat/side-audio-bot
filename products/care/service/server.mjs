// 晚晴·照护场景服务：向 UI 投影机构状态，暴露前台/后台双面 MCP 工具。
// 不属于 Gateway，也不是第二套 qwen-audio-agent 运行时。
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import {
  StreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CareService } from './care-service.mjs'
import { createCareMcpServer } from './mcp-server.mjs'
import { loadCareEnvironment } from '../bootstrap/environment.mjs'
import {
  BACKEND_TOOL_DEFINITIONS,
  FRONTEND_TOOL_DEFINITIONS,
} from './tools/registry.mjs'

const MAX_JSON_BYTES = 64 * 1024

function careId(request, url, body = {}) {
  return String(
    request.headers['x-care-id']
    || url.searchParams.get('careId')
    || body.careId
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

export class CareServiceServer {
  constructor({
    service = new CareService(),
    host = '127.0.0.1',
    port = 3110,
  } = {}) {
    this.service = service
    this.host = host
    this.port = port
    this.server = null
    this.sockets = new Set()
    this.toolCallListeners = new Set()
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

  subscribeToolCalls(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Care service tool call listener must be a function')
    }
    this.toolCallListeners.add(listener)
    return () => this.toolCallListeners.delete(listener)
  }

  async #handle(request, response) {
    const url = new URL(request.url || '/', `http://${this.host}`)
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-care-id, mcp-protocol-version, mcp-session-id',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      })
      response.end()
      return
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      json(response, 200, { ok: true, service: 'wanqing-care-service' })
      return
    }
    if (url.pathname === '/api/care/state' && request.method === 'GET') {
      json(response, 200, this.service.snapshot(careId(request, url)))
      return
    }
    if (url.pathname === '/api/care/events' && request.method === 'GET') {
      this.#events(request, response, careId(request, url))
      return
    }
    if (url.pathname === '/api/care/commands' && request.method === 'POST') {
      const body = await readJson(request)
      const output = await this.service.execute(body.name, body.arguments || {}, {
        careId: careId(request, url, body),
      })
      json(response, 200, output)
      return
    }
    if (url.pathname === '/api/care/heartbeat' && request.method === 'POST') {
      const body = await readJson(request)
      this.service.heartbeat(careId(request, url, body), body.roomId)
      json(response, 200, { ok: true })
      return
    }
    if (url.pathname === '/api/care/reset' && request.method === 'POST') {
      json(response, 200, this.service.reset(careId(request, url, body ?? {})))
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
      await this.#mcp(request, response, careId(request, url), mcpTools, mcpSurface)
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
    const server = createCareMcpServer({
      service: this.service,
      careId: id,
      tools,
      surface,
      onToolCall: event => {
        for (const listener of this.toolCallListeners) {
          try {
            listener(event)
          } catch {
            // 追踪不影响业务。
          }
        }
      },
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

export async function startCareServiceServer(options = {}) {
  const runtime = new CareServiceServer(options)
  await runtime.start()
  return runtime
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadCareEnvironment()
  const runtime = await startCareServiceServer({
    host: process.env.CARE_SERVICE_HOST || '127.0.0.1',
    port: Number(process.env.CARE_SERVICE_PORT) || 3110,
  })
  console.log(`晚晴·照护 Service listening on ${runtime.origin}`)
  const close = async () => {
    await runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
