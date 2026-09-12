// 晚晴伴工具注册表：SOS/问安/提醒确认走后台，天气媒体状态走前台。
import { executeSosTool } from './sos/execute.mjs'
import { executeReminderTool } from './reminder/execute.mjs'
import { executeCheckinTool } from './checkin/execute.mjs'
import { executeStatusTool } from './status/execute.mjs'
import { executeMediaTool } from './media/execute.mjs'
import { executeWeatherTool } from './weather/execute.mjs'

const READ_ONLY = new Set(['status_query', 'weather_query'])

function group(domain, label, functions, execute) {
  return Object.freeze({
    domain,
    label,
    execute,
    definitions: Object.freeze(functions.map(tool => Object.freeze({
      name: tool.name,
      title: tool.label || label,
      description: tool.description,
      inputSchema: tool.parameters,
      annotations: { readOnlyHint: READ_ONLY.has(tool.name) },
    }))),
  })
}

const sosGroup = group('sos', '紧急求助', [
  {
    name: 'sos_manage',
    label: '紧急求助',
    description: '老人紧急求助的完整升级链路。老人说救命、不舒服、摔倒、胸闷等紧急情况时 action=trigger；家属确认看到后 action=ack；处理完毕 action=resolve；action=query 查询当前求助状态。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['trigger', 'ack', 'resolve', 'query'], description: 'trigger=发起求助, ack=家属确认, resolve=处理完毕, query=查询状态' },
        reason: { type: 'string', description: '老人的求助原因' },
        byName: { type: 'string', description: '确认的家属姓名，ack 时使用' },
      },
      required: ['action'],
    },
  },
], executeSosTool)

const reminderGroup = group('reminder', '提醒', [
  {
    name: 'reminder_confirm',
    label: '提醒确认',
    description: '老人口头确认完成了提醒（吃药、活动等）时调用。例如"吃了""记住了"。',
    parameters: {
      type: 'object',
      properties: {
        reminderName: { type: 'string', description: '确认的提醒名称，如"降压药"' },
      },
      required: [],
    },
  },
  {
    name: 'reminder_query',
    label: '查询提醒',
    description: '查询今天的提醒安排和完成情况。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
], executeReminderTool)

const checkinGroup = group('checkin', '问安', [
  {
    name: 'checkin_start',
    label: '发起问安',
    description: '发起一次问安：老人端会自动响起并进入对话。由每日定时调度或家属手动触发。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'checkin_complete',
    label: '完成问安',
    description: '问安对话结束时调用，记录老人心情与提到的事情。老人说"聊好了""没事了"或对话自然结束时使用。心情从对话中判断（不错/一般/不太好）。',
    parameters: {
      type: 'object',
      properties: {
        mood: { type: 'string', enum: ['不错', '一般', '不太好'], description: '老人今天的心情' },
        notes: { type: 'string', description: '老人提到的重要事情，如"腰有点酸"' },
      },
      required: ['mood'],
    },
  },
], executeCheckinTool)

const statusGroup = group('status', '状态', [
  {
    name: 'status_query',
    label: '查状态',
    description: '查询老人的当前状态：今天是否问安、最近对话时间。老人问"女儿知道我好吗"时使用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
], executeStatusTool)

const mediaGroup = group('media', '媒体', [
  {
    name: 'media_play',
    label: '播放媒体',
    description: '播放戏曲、音乐或停止。老人说"放段豫剧""别放了"时使用。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['play', 'stop'] },
        query: { type: 'string', description: '想听的内容' },
      },
      required: ['action'],
    },
  },
], executeMediaTool)

const weatherGroup = group('weather', '天气', [
  {
    name: 'weather_query',
    label: '查天气',
    description: '老人问天气、冷不冷时使用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
], executeWeatherTool)

export const HOME_TOOL_GROUPS = Object.freeze([
  sosGroup,
  reminderGroup,
  checkinGroup,
  statusGroup,
  mediaGroup,
  weatherGroup,
])

const ALL_DEFINITIONS = HOME_TOOL_GROUPS.flatMap(group => group.definitions)
if (new Set(ALL_DEFINITIONS.map(tool => tool.name)).size !== ALL_DEFINITIONS.length) {
  throw new Error('Home tool names must be unique')
}

export const HOME_SURFACE_ROUTING = Object.freeze({
  version: 1,
  domains: Object.freeze({
    sos: 'backend',
    reminder: 'backend',
    checkin: 'backend',
    status: 'frontend',
    media: 'frontend',
    weather: 'frontend',
  }),
})

const byName = new Map(ALL_DEFINITIONS.map(tool => [tool.name, tool]))
const definitionsForNames = names => Object.freeze(names.map(name => {
  const tool = byName.get(name)
  if (!tool) throw new Error(`Unknown home tool in surface routing: ${name}`)
  return tool
}))

const frontendDomains = Object.entries(HOME_SURFACE_ROUTING.domains)
  .filter(([, surface]) => surface === 'frontend').map(([domain]) => domain)
const backendDomains = Object.entries(HOME_SURFACE_ROUTING.domains)
  .filter(([, surface]) => surface === 'backend').map(([domain]) => domain)

export const FRONTEND_TOOL_DEFINITIONS = definitionsForNames(
  HOME_TOOL_GROUPS.filter(group => frontendDomains.includes(group.domain))
    .flatMap(group => group.definitions.map(tool => tool.name)),
)
export const BACKEND_TOOL_DEFINITIONS = definitionsForNames(
  HOME_TOOL_GROUPS.filter(group => backendDomains.includes(group.domain))
    .flatMap(group => group.definitions.map(tool => tool.name)),
)

const EXECUTORS = new Map(HOME_TOOL_GROUPS.flatMap(group => (
  group.definitions.map(tool => [tool.name, group.execute])
)))

export function executeHomeTool(name, args, context) {
  const execute = EXECUTORS.get(name)
  if (!execute) throw new Error(`Unknown home tool: ${name}`)
  return execute(name, args, context)
}
