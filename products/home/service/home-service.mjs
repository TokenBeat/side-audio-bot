// 晚晴伴场景服务核心：状态存储 + 工具分发 + 活动事件。
import { HomeStateStore } from './state-store.mjs'
import {
  HOME_TOOL_GROUPS,
  executeHomeTool,
} from './tools/registry.mjs'

const TOOL_NAMES = new Set(HOME_TOOL_GROUPS.flatMap(group => group.definitions.map(tool => tool.name)))

export class HomeService {
  constructor({ store = new HomeStateStore(), now = Date.now } = {}) {
    this.store = store
    this.now = now
    this.activityListeners = new Map()
    // 提醒到期巡检（演示级）：每 30 秒。
    this.reminderTimer = setInterval(() => this.sweepReminders(), 30_000)
    this.reminderTimer.unref?.()
  }

  snapshot(homeId = 'default') {
    return this.store.snapshot(homeId)
  }

  subscribe(homeId, listener) {
    return this.store.subscribe(homeId, listener)
  }

  touchVoice(homeId, notes) {
    this.store.touchVoice(homeId, notes)
  }

  reset(homeId = 'default') {
    return this.store.reset(homeId)
  }

  close() {
    clearInterval(this.reminderTimer)
  }

  subscribeActivity(homeId, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function')
    const id = homeId || 'default'
    const listeners = this.activityListeners.get(id) || new Set()
    listeners.add(listener)
    this.activityListeners.set(id, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.activityListeners.delete(id)
    }
  }

  #publishActivity(homeId, event) {
    const id = homeId || 'default'
    const published = Object.freeze({
      type: 'home.activity',
      homeId: id,
      at: new Date().toISOString(),
      ...event,
    })
    for (const listener of this.activityListeners.get(id) || []) {
      try {
        listener(published)
      } catch {
        // 观察者不能影响照护操作。
      }
    }
  }

  sweepReminders(homeId = 'default') {
    const snapshot = this.store.snapshot(homeId)
    const now = new Date(this.now())
    const minutes = now.getHours() * 60 + now.getMinutes()
    for (const item of snapshot.reminders) {
      if (item.confirmedAt) continue
      const [hours, mins] = String(item.time || '').split(':').map(Number)
      if (!Number.isInteger(hours) || !Number.isInteger(mins)) continue
      const due = hours * 60 + mins
      if (minutes === due) {
        this.#publishActivity(homeId, {
          kind: 'status',
          category: 'reminder',
          status: 'due',
          message: `提醒：${item.time} ${item.name}（${item.note}）`,
        })
      }
    }
  }

  async execute(name, args = {}, { homeId = 'default' } = {}) {
    if (!TOOL_NAMES.has(name)) {
      throw new Error(`Unknown home tool: ${name}`)
    }
    const reportActivity = event => {
      this.#publishActivity(homeId, event)
    }
    return executeHomeTool(name, args, {
      homeId,
      now: this.now,
      onActivity: reportActivity,
      snapshot: () => this.snapshot(homeId),
      store: this.store,
    })
  }
}
