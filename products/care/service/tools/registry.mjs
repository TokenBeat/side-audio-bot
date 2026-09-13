// 晚晴·照护工具注册表。工具按业务域分组，surface routing 决定每个域
// 挂到前台低延迟 MCP 还是后台编排 MCP（座舱同一机制）。
import { executeCallTool } from './call/execute.mjs'
import { executeMedicationTool } from './medication/execute.mjs'
import { executeRoomTool } from './room/execute.mjs'
import { executeActivityTool } from './activity/execute.mjs'
import { executeMediaTool } from './media/execute.mjs'
import { executeVitalsTool } from './vitals/execute.mjs'
import { executeWeatherTool } from './weather/execute.mjs'

const READ_ONLY = new Set([
  'room_state_query',
  'medication_plan_query',
  'activity_query',
  'duty_query',
  'vitals_query',
  'weather_query',
])

function group(domain, label, description, functions, execute) {
  return Object.freeze({
    domain,
    label,
    execute,
    definitions: Object.freeze(functions.map(tool => Object.freeze({
      name: tool.name,
      title: tool.label || label,
      description: tool.description,
      inputSchema: tool.parameters,
      annotations: {
        readOnlyHint: READ_ONLY.has(tool.name),
        destructiveHint: tool.name === 'call_manage',
      },
    }))),
  })
}

const callGroup = group('call', '呼叫与工单', '老人呼叫护理员的求助工单：创建、受理、完成、升级查询。', [
  {
    name: 'call_manage',
    label: '呼叫工单',
    description: '老人呼叫护理员的完整流程。老人表达求助（要喝水、疼痛、上厕所、跌倒、不舒服等）时 action=create；意图紧急（疼痛/跌倒/胸闷/呼救）时 urgency=urgent，否则 normal。action=accept 由护理员受理；action=complete 标记完成；action=query 查询工单状态。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'accept', 'complete', 'query'], description: 'create=老人发起呼叫, accept=护理员受理, complete=处理完成, query=查询工单' },
        roomId: { type: 'string', description: '房间号，如 302。老人自己呼叫时不传，默认当前终端房间' },
        intent: { type: 'string', description: '老人的求助内容，如"想喝水""腰疼""去厕所"' },
        urgency: { type: 'string', enum: ['normal', 'urgent'], description: 'urgent=疼痛/跌倒/胸闷等紧急情况' },
        ticketId: { type: 'string', description: '工单 id，accept/complete/query 时使用' },
        staffName: { type: 'string', description: '受理护理员姓名，accept 时使用' },
      },
      required: ['action'],
    },
  },
], executeCallTool)

const medicationGroup = group('medication', '用药', '老人用药计划查询与服药确认。', [
  {
    name: 'medication_plan_query',
    label: '查询用药计划',
    description: '查询某房间老人的用药计划与今日确认情况。老人问"我该吃什么药"时使用。',
    parameters: {
      type: 'object',
      properties: {
        roomId: { type: 'string', description: '房间号。老人自己查询时不传' },
      },
      required: [],
    },
  },
  {
    name: 'medication_confirm',
    label: '确认服药',
    description: '老人口头确认已服药时调用，例如"吃了""吃好了"。确认结果会同步到护理站与家属端。',
    parameters: {
      type: 'object',
      properties: {
        roomId: { type: 'string', description: '房间号。老人自己确认时不传' },
        medicationName: { type: 'string', description: '确认服用的药名' },
      },
      required: [],
    },
  },
], executeMedicationTool)

const roomGroup = group('room', '房间状态', '房间与老人的当前状态、提醒查询。', [
  {
    name: 'room_state_query',
    label: '查询房间状态',
    description: '查询房间老人的当前状态（平安/呼叫中/提醒/离线）与最近工单。老人问"护理员在忙吗"或系统需要房间信息时使用。',
    parameters: {
      type: 'object',
      properties: {
        roomId: { type: 'string', description: '房间号。不传则返回全部房间概览' },
      },
      required: [],
    },
  },
], executeRoomTool)

const activityGroup = group('activity', '活动', '院内活动查询与报名。', [
  {
    name: 'activity_query',
    label: '查询活动',
    description: '查询院内近期的活动安排（时间、内容、报名人数）。老人问"有什么活动"时使用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'activity_signup',
    label: '活动报名',
    description: '为老人报名院内活动。老人明确说"帮我报名"时使用；只是询问时不要报名。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '活动名称，如"手工课"' },
        residentName: { type: 'string', description: '报名老人姓名。老人自己报名时不传' },
      },
      required: ['title'],
    },
  },
], executeActivityTool)

const vitalsGroup = group('vitals', '健康数据', '老人每日健康测量数据：血压、血糖、心率、血氧的查询与录入。', [
  {
    name: 'vitals_query',
    label: '查询健康数据',
    description: '查询老人今天测量的血压、血糖、心率、血氧等数据与评估。老人问"我血压怎么样""今天血糖多少"时使用。',
    parameters: {
      type: 'object',
      properties: {
        roomId: { type: 'string', description: '房间号。老人自己查询时不传' },
      },
      required: [],
    },
  },
  {
    name: 'vitals_record',
    label: '记录测量数据',
    description: '录入一次健康测量。老人说"帮我记一下血压 135 85""血糖 6 8"时使用。bloodPressure 需要 systolic（高压）和 diastolic（低压）两个数；血糖 stage 填"空腹"或"餐后"。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['bloodPressure', 'bloodSugar', 'heartRate', 'bloodOxygen', 'temperature'], description: 'bloodPressure=血压, bloodSugar=血糖, heartRate=心率, bloodOxygen=血氧, temperature=体温' },
        roomId: { type: 'string', description: '房间号。老人自己录入时不传' },
        systolic: { type: 'number', description: '高压（收缩压），bloodPressure 时必填' },
        diastolic: { type: 'number', description: '低压（舒张压），bloodPressure 时必填' },
        value: { type: 'number', description: '测量数值，bloodSugar/heartRate/bloodOxygen/temperature 时必填' },
        stage: { type: 'string', description: '血糖测量阶段：空腹或餐后' },
      },
      required: ['kind'],
    },
  },
], executeVitalsTool)

const mediaGroup = group('media', '戏曲广播', '为老人播放戏曲、广播等音频内容（演示用播放列表）。', [
  {
    name: 'media_play',
    label: '播放媒体',
    description: '播放戏曲、广播或停止播放。老人说"放段豫剧""听广播""别放了"时使用。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['play', 'stop'], description: 'play=播放, stop=停止' },
        query: { type: 'string', description: '想听的内容，如"豫剧""评书""早上好音乐"' },
      },
      required: ['action'],
    },
  },
], executeMediaTool)

const weatherGroup = group('weather', '天气', '查询当地天气，供老人穿衣与出行参考。', [
  {
    name: 'weather_query',
    label: '查天气',
    description: '老人问天气、冷不冷、要不要加衣服时使用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
], executeWeatherTool)

export const CARE_TOOL_GROUPS = Object.freeze([
  callGroup,
  medicationGroup,
  roomGroup,
  activityGroup,
  vitalsGroup,
  mediaGroup,
  weatherGroup,
])

const definitionsOf = groups => Object.freeze(groups.flatMap(group => group.definitions))

const ALL_DEFINITIONS = definitionsOf(CARE_TOOL_GROUPS)
if (new Set(ALL_DEFINITIONS.map(tool => tool.name)).size !== ALL_DEFINITIONS.length) {
  throw new Error('Care tool names must be unique')
}

// 域级路由：呼叫/用药确认/报名走后台编排；状态、天气、媒体、活动查询走前台低延迟。
export const CARE_SURFACE_ROUTING = Object.freeze({
  version: 1,
  domains: Object.freeze({
    call: 'backend',
    medication: 'backend',
    room: 'frontend',
    activity: 'backend',
    vitals: 'frontend',
    media: 'frontend',
    weather: 'frontend',
  }),
})

const byName = new Map(ALL_DEFINITIONS.map(tool => [tool.name, tool]))
const definitionsForNames = names => Object.freeze(names.map(name => {
  const tool = byName.get(name)
  if (!tool) throw new Error(`Unknown care tool in surface routing: ${name}`)
  return tool
}))

const frontendDomains = Object.entries(CARE_SURFACE_ROUTING.domains)
  .filter(([, surface]) => surface === 'frontend').map(([domain]) => domain)
const backendDomains = Object.entries(CARE_SURFACE_ROUTING.domains)
  .filter(([, surface]) => surface === 'backend').map(([domain]) => domain)

export const FRONTEND_TOOL_DEFINITIONS = definitionsForNames(
  CARE_TOOL_GROUPS.filter(group => frontendDomains.includes(group.domain))
    .flatMap(group => group.definitions.map(tool => tool.name)),
)
export const BACKEND_TOOL_DEFINITIONS = definitionsForNames(
  CARE_TOOL_GROUPS.filter(group => backendDomains.includes(group.domain))
    .flatMap(group => group.definitions.map(tool => tool.name)),
)

const EXECUTORS = new Map(CARE_TOOL_GROUPS.flatMap(group => (
  group.definitions.map(tool => [tool.name, group.execute])
)))

export function executeCareTool(name, args, context) {
  const execute = EXECUTORS.get(name)
  if (!execute) throw new Error(`Unknown care tool: ${name}`)
  return execute(name, args, context)
}
