// 晚晴·家工具注册表。设备与场景是低延迟前台域；多步联动走后台 Agent。
import { clean, reportActivity, toolResult } from './shared.mjs'

function executeDeviceTool(name, args, context) {
  const { hubId, store, onActivity } = context
  const before = store.snapshot(hubId)
  const action = clean(args.action) || 'query'

  if (action === 'query') {
    const deviceId = clean(args.device)
    if (deviceId) {
      const device = before.devices[deviceId]
      if (!device) return toolResult(`没有找到这个设备。`, before, false)
      return toolResult(
        `${device.name}：${deviceSummary(device)}`,
        before,
        false,
        { device },
      )
    }
    const room = clean(args.room)
    const list = Object.entries(before.devices)
      .filter(([, device]) => !room || device.room === room)
      .map(([id, device]) => `${device.name}：${deviceSummary(device)}`)
    return toolResult(list.join('；'), before, false, { devices: before.devices })
  }

  // toggle / set：老人口语("开个灯""空调调到26度""把窗帘关上")归一到设备与属性
  const match = matchDevice(before, args)
  if (!match) {
    return toolResult(
      '家里没找到这个设备。现有：客厅/卧室的灯、空调、窗帘，夜灯和电视。',
      before,
      false,
    )
  }
  const changes = {}
  if (action === 'toggle') {
    changes.on = !match.device.on
  } else if (match.kind === 'light' || match.kind === 'nightlight') {
    if (args.brightness != null) changes.brightness = clamp(Number(args.brightness), 1, 100)
    if (clean(args.colorTemp)) changes.colorTemp = clean(args.colorTemp)
    if (args.on != null) changes.on = Boolean(args.on)
    else if (args.brightness == null && !clean(args.colorTemp)) changes.on = true
    if (changes.brightness != null) changes.on = true
  } else if (match.kind === 'ac') {
    if (args.on != null) changes.on = Boolean(args.on)
    if (args.temp != null) {
      changes.temp = clamp(Math.round(Number(args.temp)), 16, 30)
      changes.on = true
    }
    if (clean(args.mode)) changes.mode = clean(args.mode)
    if (changes.temp == null && args.on == null && !clean(args.mode)) changes.on = !match.device.on
  } else if (match.kind === 'curtain') {
    if (args.position != null) changes.position = clamp(Number(args.position), 0, 100)
    else if (clean(args.direction) === '开') changes.position = 100
    else if (clean(args.direction) === '关') changes.position = 0
    else changes.position = match.device.position > 50 ? 0 : 100
  } else if (match.kind === 'media') {
    changes.on = args.on != null ? Boolean(args.on) : !match.device.on
  }

  const result = store.applyDeviceChange(hubId, match.id, changes)
  reportActivity(onActivity, 'device', 'changed',
    `${result.name} → ${deviceSummary(result.device)}`)
  return toolResult(
    `${result.name}，${deviceSummary(result.device)}。`,
    store.snapshot(hubId),
    true,
    { device: match.id, ...result.device },
  )
}

function deviceSummary(device) {
  if (device.kind === 'light' || device.kind === 'nightlight') {
    return device.on ? `已开，亮度 ${device.brightness}%${device.colorTemp ? `，${device.colorTemp}` : ''}` : '已关'
  }
  if (device.kind === 'ac') {
    return device.on ? `已开，${device.mode} ${device.temp} 度` : '已关'
  }
  if (device.kind === 'curtain') {
    return device.position >= 95 ? '已打开' : device.position <= 5 ? '已关闭' : `开到 ${device.position}%`
  }
  if (device.kind === 'media') return device.on ? '已开' : '已关'
  return ''
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

const ROOM_ALIASES = {
  '客厅': 'living',
  '卧室': 'bedroom',
  '厨房': 'kitchen',
  living: 'living',
  bedroom: 'bedroom',
  kitchen: 'kitchen',
}

function matchDevice(state, args) {
  const entries = Object.entries(state.devices)
  const deviceId = clean(args.device)
  if (deviceId && state.devices[deviceId]) {
    return { id: deviceId, device: state.devices[deviceId], kind: state.devices[deviceId].kind }
  }
  const room = ROOM_ALIASES[clean(args.room)] || clean(args.room)
  const nameQuery = clean(args.name)
  const kind = clean(args.kind)
  const candidates = entries.filter(([id, device]) => (
    (!room || device.room === room)
    && (!kind || device.kind === kind)
    && (!nameQuery || device.name.includes(nameQuery) || nameQuery.includes(device.name.replace(/^(客厅|卧室|厨房)/, '')))
  ))
  if (candidates.length === 1) {
    return { id: candidates[0][0], device: candidates[0][1], kind: candidates[0][1].kind }
  }
  if (candidates.length > 1) {
    // 无房间指向时优先客厅；开灯意图优先没亮的灯
    const living = candidates.find(([id]) => id.includes('living'))
    const off = candidates.find(([, device]) => device.on === false)
    const pick = (kind !== 'ac' && off) || (candidates.length && off && kind !== 'ac') ? off : (living || candidates[0])
    return { id: pick[0], device: pick[1], kind: pick[1].kind }
  }
  // 按类型兜底（"开个灯"）
  if (kind === 'light') {
    const light = entries.find(([id, device]) => device.kind === 'light' && id !== 'nightlight')
    if (light) return { id: light[0], device: light[1], kind: 'light' }
  }
  if (kind === 'ac') {
    const ac = entries.find(([, device]) => device.kind === 'ac')
    if (ac) return { id: ac[0], device: ac[1], kind: 'ac' }
  }
  if (kind === 'curtain') {
    const curtain = entries.find(([, device]) => device.kind === 'curtain')
    if (curtain) return { id: curtain[0], device: curtain[1], kind: 'curtain' }
  }
  return null
}

function executeSceneTool(name, args, context) {
  const { hubId, store, onActivity } = context
  const before = store.snapshot(hubId)
  const sceneName = clean(args.scene)
  const scene = before.scenes.find(item => item.id === sceneName || item.name.includes(sceneName))
  if (!scene) {
    return toolResult(
      `没有这个场景。现有：${before.scenes.map(item => item.name).join('、')}。`,
      before,
      false,
    )
  }
  const applied = store.applyScene(hubId, scene.id)
  reportActivity(onActivity, 'scene', 'activated', `场景「${applied.name}」已执行`)
  const highlights = applied.actions
    .slice(0, 3)
    .map(action => {
      const device = store.device(hubId, action.device)
      if (!device) return ''
      return `${device.name}，${deviceSummary(device)}`
    })
    .filter(Boolean)
  return toolResult(
    `${applied.name}已开启。${highlights.join('；')}。`,
    store.snapshot(hubId),
    true,
    { scene: applied },
  )
}

function executeSensorTool(name, args, context) {
  const { hubId, store } = context
  const before = store.snapshot(hubId)
  return toolResult(
    `室内 ${before.sensors.indoorTemp} 度，湿度 ${before.sensors.humidity}%，门窗${before.sensors.doorWindow}，最近活动在${before.sensors.lastMotion.room}。`,
    before,
    false,
    { sensors: before.sensors },
  )
}

export const HUB_TOOL_GROUPS = Object.freeze([
  Object.freeze({
    domain: 'device',
    label: '设备控制',
    execute: executeDeviceTool,
    definitions: Object.freeze([
      Object.freeze({
        name: 'device_control',
        title: '设备控制',
        description: '控制家里的设备：灯（开关/亮度/色温）、空调（开关/温度/模式）、窗帘（开合）、夜灯、电视。action=toggle 直接反转开关状态；action=set 设置属性；action=query 查询设备状态。老人说"开个灯"用 kind=light 不带 room；说"关卧室灯"用 kind=light + room=卧室。',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['toggle', 'set', 'query'], description: 'toggle=反转开关, set=设置属性, query=查询状态' },
            kind: { type: 'string', enum: ['light', 'ac', 'curtain', 'nightlight', 'media'], description: '设备类型' },
            room: { type: 'string', description: '房间：客厅/卧室/厨房' },
            name: { type: 'string', description: '设备名关键字，如"主灯""空调"' },
            device: { type: 'string', description: '设备 id（query 单个设备时使用）' },
            on: { type: 'boolean', description: '开关状态' },
            brightness: { type: 'number', description: '亮度 1-100' },
            colorTemp: { type: 'string', description: '色温：暖光/自然/冷光' },
            temp: { type: 'number', description: '空调温度 16-30' },
            mode: { type: 'string', description: '空调模式：制冷/制热/除湿/送风' },
            position: { type: 'number', description: '窗帘开合 0-100' },
            direction: { type: 'string', description: '窗帘方向：开/关' },
          },
          required: ['action'],
        },
        annotations: { readOnlyHint: false },
      }),
    ]),
  }),
  Object.freeze({
    domain: 'scene',
    label: '场景',
    execute: executeSceneTool,
    definitions: Object.freeze([
      Object.freeze({
        name: 'scene_activate',
        title: '场景',
        description: '执行全屋场景。老人说"我睡了""我要睡了"用 scene=我睡了；"回家"用 scene=回家模式；"起夜"用 scene=起夜模式；"看电影"用 scene=观影模式；"出门"用 scene=离家模式。',
        inputSchema: {
          type: 'object',
          properties: {
            scene: { type: 'string', description: '场景名' },
          },
          required: ['scene'],
        },
        annotations: { readOnlyHint: false },
      }),
    ]),
  }),
  Object.freeze({
    domain: 'sensor',
    label: '环境传感',
    execute: executeSensorTool,
    definitions: Object.freeze([
      Object.freeze({
        name: 'sensor_query',
        title: '查环境',
        description: '查询室内温湿度、门窗状态与最近活动。老人问"屋里多少度""门窗关了吗"时使用。',
        inputSchema: { type: 'object', properties: {}, required: [] },
        annotations: { readOnlyHint: true },
      }),
    ]),
  }),
])

const ALL_DEFINITIONS = HUB_TOOL_GROUPS.flatMap(group => group.definitions)
if (new Set(ALL_DEFINITIONS.map(tool => tool.name)).size !== ALL_DEFINITIONS.length) {
  throw new Error('Hub tool names must be unique')
}

export const HUB_SURFACE_ROUTING = Object.freeze({
  version: 1,
  domains: Object.freeze({
    device: 'frontend',
    scene: 'frontend',
    sensor: 'frontend',
  }),
})

export const FRONTEND_TOOL_DEFINITIONS = Object.freeze(ALL_DEFINITIONS)
export const BACKEND_TOOL_DEFINITIONS = Object.freeze(ALL_DEFINITIONS)
