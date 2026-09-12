// 晚晴·照护场景服务核心：持有状态存储，统一执行工具，发布活动事件。
import { CareStateStore } from './state-store.mjs'
import {
  CARE_TOOL_GROUPS,
  executeCareTool,
} from './tools/registry.mjs'

const TOOL_NAMES = new Set(CARE_TOOL_GROUPS.flatMap(group => group.definitions.map(tool => tool.name)))

export class CareService {
  constructor({ store = new CareStateStore(), now = Date.now } = {}) {
    this.store = store
    this.now = now
    this.activityListeners = new Map()
    // 演示级提醒调度：每 30 秒检查一次用药计划，到期就点亮房间提醒。
    this.reminderTimer = setInterval(() => this.sweepMedicationReminders(), 30_000)
    this.reminderTimer.unref?.()
    // 终端离线巡检：每 15 秒检查心跳。
    this.offlineTimer = setInterval(() => {
      for (const careId of new Set(['default', ...this.activityListeners.keys()])) {
        this.store.sweepOffline(careId)
      }
    }, 15_000)
    this.offlineTimer.unref?.()
  }

  snapshot(careId = 'default') {
    return this.store.snapshot(careId)
  }

  subscribe(careId, listener) {
    return this.store.subscribe(careId, listener)
  }

  heartbeat(careId, roomId) {
    this.store.heartbeat(careId, roomId)
    return this.store.snapshot(careId)
  }

  reset(careId = 'default') {
    return this.store.reset(careId)
  }

  close() {
    clearInterval(this.reminderTimer)
    clearInterval(this.offlineTimer)
  }

  subscribeActivity(careId, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function')
    const id = careId || 'default'
    const listeners = this.activityListeners.get(id) || new Set()
    listeners.add(listener)
    this.activityListeners.set(id, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.activityListeners.delete(id)
    }
  }

  #publishActivity(careId, event) {
    const id = careId || 'default'
    const published = Object.freeze({
      type: 'care.activity',
      careId: id,
      at: new Date().toISOString(),
      ...event,
    })
    for (const listener of this.activityListeners.get(id) || []) {
      try {
        listener(published)
      } catch {
        // 场景观察者不能影响照护操作。
      }
    }
  }

  sweepMedicationReminders(careId = 'default') {
    const snapshot = this.store.snapshot(careId)
    const now = new Date(this.now())
    const minutes = now.getHours() * 60 + now.getMinutes()
    for (const room of snapshot.rooms) {
      const plan = snapshot.medications[room.id]
      if (!plan) continue
      const today = now.toISOString().slice(0, 10)
      for (const item of plan.items) {
        const [hours, mins] = String(item.time || '').split(':').map(Number)
        if (!Number.isInteger(hours) || !Number.isInteger(mins)) continue
        const due = hours * 60 + mins
        const confirmedToday = plan.confirmations.some(entry => (
          entry.date === today && entry.name === item.name
        ))
        if (!confirmedToday && minutes >= due && minutes - due <= 120 && room.state === 'safe') {
          this.store.raiseReminder(careId, room.id, item)
          this.#publishActivity(careId, {
            kind: 'status',
            category: 'medication',
            status: 'due',
            message: `${room.id} ${room.resident.name} 的 ${item.time} ${item.name} 到点了`,
          })
        }
      }
    }
  }

  async execute(name, args = {}, { careId = 'default' } = {}) {
    if (!TOOL_NAMES.has(name)) {
      throw new Error(`Unknown care tool: ${name}`)
    }
    const reportActivity = event => {
      this.#publishActivity(careId, event)
    }
    return executeCareTool(name, args, {
      careId,
      now: this.now,
      onActivity: reportActivity,
      snapshot: () => this.snapshot(careId),
      store: this.store,
    })
  }
}
