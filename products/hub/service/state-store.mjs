// 晚晴·家中控状态存储：房间、设备、场景、传感器、异常联动。
// 内存态 + 版本化快照 + 订阅广播（与照护/座舱同一模式）。
import { randomUUID } from 'node:crypto'

export const NIGHT_START_HOUR = 22
export const NIGHT_END_HOUR = 6

function seedDevices() {
  return {
    'light.living': { kind: 'light', room: 'living', name: '客厅主灯', on: true, brightness: 72, colorTemp: '自然' },
    'light.bedroom': { kind: 'light', room: 'bedroom', name: '卧室主灯', on: false, brightness: 60, colorTemp: '暖光' },
    'light.kitchen': { kind: 'light', room: 'kitchen', name: '厨房灯', on: false, brightness: 80, colorTemp: '自然' },
    'nightlight': { kind: 'nightlight', room: 'bedroom', name: '起夜夜灯', on: false, brightness: 30 },
    'ac.living': { kind: 'ac', room: 'living', name: '客厅空调', on: true, temp: 26, mode: '制冷' },
    'ac.bedroom': { kind: 'ac', room: 'bedroom', name: '卧室空调', on: false, temp: 26, mode: '制冷' },
    'curtain.living': { kind: 'curtain', room: 'living', name: '客厅窗帘', position: 100 },
    'curtain.bedroom': { kind: 'curtain', room: 'bedroom', name: '卧室窗帘', position: 100 },
    'tv.living': { kind: 'media', room: 'living', name: '客厅电视', on: false },
  }
}

function seedScenes() {
  return [
    { id: 'scene-home', name: '回家模式', icon: '🏡', actions: [{ device: 'light.living', on: true, brightness: 80 }, { device: 'curtain.living', position: 100 }, { device: 'ac.living', on: true, temp: 26 }] },
    { id: 'scene-movie', name: '观影模式', icon: '🎬', actions: [{ device: 'light.living', on: true, brightness: 18 }, { device: 'curtain.living', position: 0 }, { device: 'tv.living', on: true }] },
    { id: 'scene-sleep', name: '我睡了', icon: '🌙', actions: [{ device: 'light.living', on: false }, { device: 'light.bedroom', on: false }, { device: 'light.kitchen', on: false }, { device: 'curtain.bedroom', position: 0 }, { device: 'ac.bedroom', on: true, temp: 26 }, { device: 'nightlight', on: true, brightness: 20 }] },
    { id: 'scene-night', name: '起夜模式', icon: '🕯️', actions: [{ device: 'nightlight', on: true, brightness: 45 }] },
    { id: 'scene-away', name: '离家模式', icon: '👋', actions: [{ device: 'light.living', on: false }, { device: 'light.bedroom', on: false }, { device: 'light.kitchen', on: false }, { device: 'ac.living', on: false }, { device: 'ac.bedroom', on: false }, { device: 'tv.living', on: false }, { device: 'curtain.living', position: 0 }] },
  ]
}

function initialState(now) {
  const hour = new Date(now()).getHours()
  return {
    version: 0,
    homeName: '晚晴·家',
    rooms: [
      { id: 'living', name: '客厅' },
      { id: 'bedroom', name: '卧室' },
      { id: 'kitchen', name: '厨房' },
    ],
    devices: seedDevices(),
    scenes: seedScenes(),
    sensors: {
      indoorTemp: 24.5,
      humidity: 52,
      doorWindow: '全部关闭',
      lastMotion: { room: '客厅', at: new Date(now() - 42 * 60 * 1000).toISOString() },
    },
    activeScene: hour >= 22 || hour < 6 ? 'scene-night' : '',
    alerts: [],
    automations: [
      { id: 'auto-night-light', name: '起夜自动亮灯', enabled: true, description: '夜间检测到起夜活动，自动点亮夜灯' },
    ],
    weather: { summary: '多云 18-24°', airQuality: '良' },
  }
}

export class HubStateStore {
  constructor({ now = Date.now } = {}) {
    this.now = now
    this.states = new Map()
    this.listeners = new Map()
  }

  #stateOf(hubId) {
    const id = hubId || 'default'
    if (!this.states.has(id)) this.states.set(id, initialState(this.now))
    return this.states.get(id)
  }

  snapshot(hubId = 'default') {
    return structuredClone(this.#stateOf(hubId))
  }

  subscribe(hubId, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function')
    const id = hubId || 'default'
    const listeners = this.listeners.get(id) || new Set()
    listeners.add(id ? listeners : listeners)
    listeners.add(listener)
    this.listeners.set(id, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.listeners.delete(id)
    }
  }

  reset(hubId = 'default') {
    const id = hubId || 'default'
    this.states.set(id, initialState(this.now))
    this.#publish(id, { kind: 'reset' })
    return this.snapshot(id)
  }

  update(hubId, recipe) {
    const id = hubId || 'default'
    const state = this.#stateOf(id)
    const before = state.version
    recipe(state)
    state.version = before + 1
    this.#publish(id, { kind: 'state', version: state.version })
    return this.snapshot(id)
  }

  #publish(hubId, event) {
    const id = hubId || 'default'
    const published = Object.freeze({
      type: 'hub.state',
      hubId: id,
      at: new Date().toISOString(),
      ...event,
    })
    for (const listener of this.listeners.get(id) || []) {
      try {
        listener(published)
      } catch {
        // 观察者不能影响设备操作。
      }
    }
  }

  #notify(hubId, alert) {
    const id = hubId || 'default'
    this.update(id, state => {
      state.alerts.unshift(alert)
      if (state.alerts.length > 20) state.alerts.pop()
    })
    this.#publish(id, { kind: 'alert', title: alert.title })
  }

  device(hubId, deviceId) {
    return this.#stateOf(hubId).devices[deviceId] || null
  }

  applyDeviceChange(hubId, deviceId, changes, source = 'voice') {
    const id = hubId || 'default'
    const device = this.device(id, deviceId)
    if (!device) throw new Error(`未知设备：${deviceId}`)
    const name = device.name
    this.update(id, state => {
      const target = state.devices[deviceId]
      Object.assign(target, changes)
    })
    const after = this.device(id, deviceId)
    return { name, device: structuredClone(after), source }
  }

  applyScene(hubId, sceneId, source = 'voice') {
    const id = hubId || 'default'
    const state = this.#stateOf(id)
    const scene = state.scenes.find(item => item.id === sceneId || item.name === sceneId)
    if (!scene) throw new Error(`未知场景：${sceneId}`)
    this.update(id, next => {
      for (const action of scene.actions) {
        const target = next.devices[action.device]
        if (!target) continue
        Object.assign(target, action)
      }
      next.activeScene = scene.id
    })
    return structuredClone(scene)
  }

  motion(hubId, room, { at = null } = {}) {
    const id = hubId || 'default'
    const state = this.#stateOf(id)
    const nowDate = new Date(this.now())
    const hour = nowDate.getHours()
    const night = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR
    const sleepSceneActive = state.activeScene === 'scene-sleep' || state.activeScene === 'scene-night'
    const nightLightAutomation = state.automations.find(item => item.id === 'auto-night-light')?.enabled
    let spoke = ''
    this.update(id, next => {
      next.sensors.lastMotion = { room, at: nowDate.toISOString() }
    })
    if ((night || sleepSceneActive) && nightLightAutomation && room !== 'kitchen') {
      const light = this.device(id, 'nightlight')
      if (light && !light.on) {
        this.applyDeviceChange(id, 'nightlight', { on: true, brightness: 45 }, 'automation')
        spoke = `检测到${room}有活动，已为你点亮夜灯`
        this.#notify(id, {
          id: `a-${randomUUID().slice(0, 8)}`,
          kind: 'automation',
          level: 'info',
          title: '起夜联动',
          text: spoke,
          at: nowDate.toISOString(),
        })
      }
    } else {
      spoke = `${room}检测到活动`
    }
    return { night: night || sleepSceneActive, announced: spoke }
  }

  doorWindowAlert(hubId, where, status) {
    const id = hubId || 'default'
    const state = this.#stateOf(id)
    this.update(id, next => {
      next.sensors.doorWindow = `${where}${status}`
    })
    if (status === '被打开') {
      const night = (() => {
        const hour = new Date(this.now()).getHours()
        return hour >= 22 || hour < 6
      })()
      this.#notify(id, {
        id: `a-${randomUUID().slice(0, 8)}`,
        kind: 'security',
        level: night ? 'urgent' : 'info',
        title: night ? '⚠️ 夜间门窗开启' : '门窗开启',
        text: `${where}${status}${night ? '，夜间请注意' : ''}`,
        at: new Date(this.now()).toISOString(),
      })
    }
  }

  setSensorValues(hubId, { indoorTemp, humidity }) {
    const id = hubId || 'default'
    this.update(id, state => {
      if (indoorTemp != null) state.sensors.indoorTemp = Number(indoorTemp)
      if (humidity != null) state.sensors.humidity = Number(humidity)
    })
  }
}
