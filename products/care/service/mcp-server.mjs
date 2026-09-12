import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

function errorResult(error) {
  return {
    content: [{
      type: 'text',
      text: error?.message || String(error),
    }],
    isError: true,
  }
}

export function createCareMcpServer({
  service,
  careId = 'default',
  tools,
  surface = 'unknown',
  onToolCall,
} = {}) {
  if (!service?.execute) throw new TypeError('Care MCP server requires a care service')
  if (!Array.isArray(tools)) throw new TypeError('Care MCP server requires a scoped tool list')
  const server = new Server({
    name: 'wanqing-care-service',
    version: '1.0.0',
  }, {
    capabilities: { tools: {} },
  })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }))
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      if (!tools.some(tool => tool.name === request.params.name)) {
        throw new Error(`Tool is not available on this MCP surface: ${request.params.name}`)
      }
      onToolCall?.({
        careId,
        surface,
        name: request.params.name,
        arguments: structuredClone(request.params.arguments || {}),
        at: new Date().toISOString(),
      })
      const output = await service.execute(
        request.params.name,
        request.params.arguments || {},
        { careId },
      )
      return {
        content: [{ type: 'text', text: output.content }],
        structuredContent: {
          stateVersion: output.stateVersion,
          changed: output.changed,
          ...output.data,
        },
      }
    } catch (error) {
      return errorResult(error)
    }
  })
  return server
}
