// 晚晴·家场景服务核心。
import { HubStateStore } from './state-store.mjs'
import {
  HUB_TOOL_GROUPS,
} from './tools/registry.mjs'

const EXECUTORS = new Map(HUB_TOOL_GROUPS.map(group => [group.domain, group.execute]))
const TOOL_DOMAINS = new Map(HUB_TOOL_GROUPS.flatMap(group => (
  group.definitions.map(tool => [tool.name, group.domain])
)))

export class HubService {
  constructor({ store = new HubStateStore(), now = Date.now } = {}) {
    this.store = store
    this.now = now
    this.activityListeners = new Map()
    // 环境传感漂移（演示用）：每 60 秒微调温湿度，让面板数字"活着"。
    this.driftTimer = setInterval(() => this.driftSensors(), 60_000)
    this.driftTimer.unref?.()
  }

  snapshot(hubId = 'default') {
    return this.store.snapshot(hubId)
  }

  subscribe(hubId, listener) {
    return this.store.subscribe(hubId, listener)
  }

  reset(hubId = 'default') {
    return this.store.reset(hubId)
  }

  close() {
    clearInterval(this.driftTimer)
  }

  subscribeActivity(hubId, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function')
    const id = hubId || 'default'
    const listeners = this.activityListeners.get(id) || new Set()
    listeners.add(listener)
    this.activityListeners.set(id, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.activityListeners.delete(id)
    }
  }

  #publishActivity(hubId, event) {
    const id = hubId || 'default'
    const published = Object.freeze({
      type: 'hub.activity',
      hubId: id,
      at: new Date().toISOString(),
      ...event,
    })
    for (const listener of this.activityListeners.get(id) || []) {
      try {
        listener(published)
      } catch {
        // 观察者不能影响设备操作。
      }
    }
  }

  driftSensors(hubId = 'default') {
    const snapshot = this.store.snapshot(hubId)
    const wobble = value => value + (Math.random() - 0.5) * 0.3
    this.store.setSensorValues(hubId, {
      indoorTemp: Math.round(wobble(snapshot.sensors.indoorTemp) * 10) / 10,
      humidity: Math.round(Math.min(70, Math.max(35, wobble(snapshot.sensors.humidity)))),
    })
  }

  motion(hubId, room) {
    const result = this.store.motion(hubId, room)
    if (result.announced) {
      this.#publishActivity(hubId, {
        kind: 'status',
        category: 'automation',
        status: 'linked',
        message: result.announced,
      })
    }
    return result
  }

  doorWindow(hubId, where, status) {
    this.store.doorWindowAlert(hubId, where, status)
    this.#publishActivity(hubId, {
      kind: 'status',
      category: 'security',
      status: status === '被打开' ? 'open' : 'closed',
      message: `${where}${status}`,
    })
  }

  async execute(name, args = {}, { hubId = 'default' } = {}) {
    const domain = TOOL_DOMAINS.get(name)
    if (!domain) {
      throw new Error(`Unknown hub tool: ${name}`)
    }
    const reportActivity = event => {
      this.#publishActivity(hubId, event)
    }
    return EXECUTORS.get(domain)(name, args, {
      hubId,
      now: this.now,
      onActivity: reportActivity,
      snapshot: () => this.snapshot(hubId),
      store: this.store,
    })
  }
}
