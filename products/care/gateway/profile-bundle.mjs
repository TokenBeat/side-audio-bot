import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FRONTEND_TOOL_DEFINITIONS } from '../service/tools/registry.mjs'

const COMPANION_PROFILE_URL = new URL('./assistant/companion.md', import.meta.url)

function policyDescription(tool) {
  const description = String(tool.description || tool.title || tool.name).trim()
  return `${description} 当前能力配置为前台执行，老人意图明确时直接调用本工具。`
}

export function createCareFrontendMcpConfiguration({
  frontendMcpUrl = process.env.CARE_FRONTEND_MCP_URL,
} = {}) {
  if (!frontendMcpUrl) throw new Error('Care frontend MCP URL is required')
  return {
    version: 1,
    servers: {
      care: {
        enabled: true,
        url: frontendMcpUrl,
        tools: Object.fromEntries(
          FRONTEND_TOOL_DEFINITIONS.map(tool => [tool.name, {
            enabled: true,
            description: policyDescription(tool),
          }]),
        ),
      },
    },
  }
}

export function writeCareFrontendProfileBundle({
  root = process.env.QWAUDIO_CONFIG_DIR,
  frontendMcpUrl = process.env.CARE_FRONTEND_MCP_URL,
} = {}) {
  if (!root) throw new Error('Care frontend profile bundle root is required')
  mkdirSync(root, { recursive: true })
  mkdirSync(join(root, 'assistant'), { recursive: true })
  const mcpPath = join(root, 'frontend-mcp.json')
  const profilePath = join(root, 'frontend-profile.json')
  writeFileSync(join(root, 'assistant/companion.md'), readFileSync(COMPANION_PROFILE_URL, 'utf8'))
  writeFileSync(
    mcpPath,
    `${JSON.stringify(createCareFrontendMcpConfiguration({ frontendMcpUrl }), null, 2)}\n`,
  )
  writeFileSync(
    profilePath,
    `${JSON.stringify({
      version: 1,
      name: 'wanqing-care',
      description: '晚晴·照护房间终端的前台语音伙伴：温和、笃定、叫得应人。',
      assistant: 'assistant/companion.md',
      toolSources: { mcp: 'frontend-mcp.json' },
    }, null, 2)}\n`,
  )
  return profilePath
}
