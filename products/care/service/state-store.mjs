// 晚晴·照护状态存储：房间、呼叫工单、用药计划、当班表、活动。
// 内存态 + 版本化快照 + 订阅广播（座舱 state-store 模式），演示足够、接口留足落盘空间。
import { randomUUID } from 'node:crypto'

export const ROOM_STATE = Object.freeze({
  SAFE: 'safe',
  CALLING: 'calling',
  REMINDER: 'reminder',
  OFFLINE: 'offline',
})

const CALL_ESCALATE_AFTER_MS = 3 * 60 * 1000
const OFFLINE_AFTER_MS = 30 * 1000

function seedRooms(now) {
  return [
    { id: '301', bed: '1 床', resident: { name: '王秀英', address: '王奶奶', age: 82 }, state: ROOM_STATE.SAFE, note: '' },
    { id: '302', bed: '1 床', resident: { name: '李建国', address: '李爷爷', age: 79 }, state: ROOM_STATE.SAFE, note: '' },
    { id: '303', bed: '2 床', resident: { name: '张桂兰', address: '张奶奶', age: 86 }, state: ROOM_STATE.SAFE, note: '' },
    { id: '304', bed: '1 床', resident: { name: '陈阿婆', address: '陈阿婆', age: 88 }, state: ROOM_STATE.SAFE, note: '' },
    { id: '305', bed: '2 床', resident: { name: '赵德福', address: '赵爷爷', age: 75 }, state: ROOM_STATE.SAFE, note: '' },
    { id: '306', bed: '1 床', resident: { name: '孙玉梅', address: '孙奶奶', age: 83 }, state: ROOM_STATE.SAFE, note: '' },
  ]
}

function seedMedications(now) {
  const inFiveMinutes = new Date(now() + 5 * 60 * 1000)
  const noon = new Date(now())
  noon.setHours(12, 0, 0, 0)
  return {
    '301': { items: [{ name: '降压药', time: '12:00', note: '半片，一杯温水' }], confirmations: [] },
    '302': { items: [{ name: '降糖药', time: '11:30', note: '餐前' }], confirmations: [] },
    '303': { items: [{ name: '钙片', time: '12:30', note: '2 片' }], confirmations: [] },
    '304': { items: [{ name: '心脏病药', time: '12:00', note: '遵医嘱' }], confirmations: [] },
    '305': { items: [{ name: '维 C', time: '12:00', note: '1 片' }], confirmations: [] },
    '306': { items: [{ name: '降压药', time: '12:00', note: '1 片' }], confirmations: [] },
  }
}

function seedDuty(now) {
  return {
    shift: '白班 08:00-20:00',
    staff: [
      { name: '小李', role: '护理员', onDuty: true },
      { name: '王姐', role: '护理员', onDuty: true },
      { name: '张护士长', role: '护士长', onDuty: true },
    ],
  }
}

function seedActivities(now) {
  const afternoon = new Date(now())
  afternoon.setHours(14, 0, 0, 0)
  return [
    { id: 'act-handcraft', title: '手工课', time: '14:00', attendees: ['张桂兰', '孙玉梅'] },
    { id: 'act-sing', title: '合唱角', time: '15:30', attendees: ['王秀英'] },
  ]
}

function emptyMediacState() {
  return { playing: false, channel: '', station: '' }
}

function initialState(now) {
  return {
    version: 0,
    floor: '幸福里 3 楼',
    rooms: seedRooms(now),
    callTickets: [],
    medications: seedMedications(now),
    duty: seedDuty(now),
    activities: seedActivities(now),
    media: emptyMediacState(),
    weather: { summary: '多云 18-24°', airQuality: '良' },
  }
}

export class CareStateStore {
  constructor({ now = Date.now } = {}) {
    this.now = now
    this.states = new Map()
    this.listeners = new Map()
    this.callTimers = new Map()
    this.heartbeats = new Map()
  }

  #stateOf(careId) {
    const id = careId || 'default'
    if (!this.states.has(id)) {
      this.states.set(id, initialState(this.now))
    }
    return this.states.get(id)
  }

  snapshot(careId = 'default') {
    return structuredClone(this.#stateOf(careId))
  }

  subscribe(careId, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function')
    const id = careId || 'default'
    const listeners = this.listeners.get(id) || new Set()
    listeners.add(listener)
    this.listeners.set(id, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.listeners.delete(id)
    }
  }

  reset(careId = 'default') {
    const id = careId || 'default'
    for (const timer of this.callTimers.values()) clearTimeout(timer)
    this.callTimers.clear()
    this.heartbeats.clear()
    this.states.set(id, initialState(this.now))
    this.#publish(id, { kind: 'reset' })
    return this.snapshot(id)
  }

  update(careId, recipe) {
    const id = careId || 'default'
    const state = this.#stateOf(id)
    const before = state.version
    recipe(state)
    state.version = before + 1
    if (state.version !== before + 1) return this.snapshot(id)
    this.#publish(id, { kind: 'state', version: state.version })
    return this.snapshot(id)
  }

  #publish(careId, event) {
    const id = careId || 'default'
    const published = Object.freeze({
      type: 'care.state',
      careId: id,
      at: new Date().toISOString(),
      ...event,
    })
    for (const listener of this.listeners.get(id) || []) {
      try {
        listener(published)
      } catch {
        // 状态观察者不能影响业务操作。
      }
    }
  }

  room(careId, roomId) {
    return this.#stateOf(careId).rooms.find(room => room.id === String(roomId || '').trim())
  }

  heartbeat(careId, roomId) {
    this.heartbeats.set(`${careId || 'default'}#${roomId}`, this.now())
    const room = this.room(careId, roomId)
    if (room && room.state === ROOM_STATE.OFFLINE) {
      this.update(careId, state => {
        const target = state.rooms.find(item => item.id === room.id)
        if (target && target.state === ROOM_STATE.OFFLINE) target.state = ROOM_STATE.SAFE
      })
    }
  }

  sweepOffline(careId = 'default') {
    const id = careId || 'default'
    const now = this.now()
    const stale = [...this.heartbeats.entries()]
      .filter(([key, at]) => key.startsWith(`${id}#`) && now - at > OFFLINE_AFTER_MS)
      .map(([key]) => key.split('#')[1])
    if (!stale.length) return
    this.update(id, state => {
      for (const roomId of stale) {
        const room = state.rooms.find(item => item.id === roomId)
        if (room && room.state === ROOM_STATE.SAFE) room.state = ROOM_STATE.OFFLINE
      }
    })
  }

  // 老人终端 / 语音触发的呼叫：建单、广播、安排超时升级。
  createCall(careId, { roomId, intent, urgency = 'normal', note = '' }) {
    const id = careId || 'default'
    const room = this.room(id, roomId)
    if (!room) throw new Error(`未知房间：${roomId}`)
    const ticket = {
      id: `call-${randomUUID().slice(0, 8)}`,
      roomId: room.id,
      resident: room.resident.name,
      intent: String(intent || '呼叫护理员').trim() || '呼叫护理员',
      urgency: urgency === 'urgent' ? 'urgent' : 'normal',
      note,
      status: 'new',
      createdAt: new Date(this.now()).toISOString(),
      acceptedBy: '',
      acceptedAt: '',
      completedAt: '',
      responseSeconds: 0,
      escalateAt: new Date(this.now() + CALL_ESCALATE_AFTER_MS).toISOString(),
      escalated: false,
    }
    this.update(id, state => {
      state.callTickets.unshift(ticket)
      const target = state.rooms.find(item => item.id === room.id)
      if (target) target.state = ROOM_STATE.CALLING
    })
    const timer = setTimeout(() => {
      this.callTimers.delete(ticket.id)
      this.#escalate(id, ticket.id)
    }, CALL_ESCALATE_AFTER_MS)
    timer.unref?.()
    this.callTimers.set(ticket.id, timer)
    return structuredClone(ticket)
  }

  #escalate(careId, ticketId) {
    const id = careId || 'default'
    const state = this.#stateOf(id)
    const ticket = state.callTickets.find(item => item.id === ticketId)
    if (!ticket || ticket.status !== 'new') return
    this.update(id, next => {
      const target = next.callTickets.find(item => item.id === ticketId)
      if (!target || target.status !== 'new') return
      target.status = 'escalated'
      target.escalated = true
    })
  }

  acceptCall(careId, ticketId, staffName) {
    const id = careId || 'default'
    const state = this.#stateOf(id)
    const ticket = state.callTickets.find(item => item.id === ticketId)
    if (!ticket || ticket.status !== 'new') throw new Error(`工单不可受理：${ticketId}`)
    const room = ticket.roomId
    this.update(id, next => {
      const target = next.callTickets.find(item => item.id === ticketId)
      if (!target || target.status !== 'new') return
      target.status = 'accepted'
      target.acceptedBy = String(staffName || '').trim() || '护理员'
      target.acceptedAt = new Date(this.now()).toISOString()
    })
    const timer = this.callTimers.get(ticketId)
    if (timer) {
      clearTimeout(timer)
      this.callTimers.delete(ticketId)
    }
    return this.callTicket(careId, ticketId)
  }

  completeCall(careId, ticketId) {
    const id = careId || 'default'
    const acceptedAt = this.callTicket(id, ticketId)?.acceptedAt
    this.update(id, next => {
      const target = next.callTickets.find(item => item.id === ticketId)
      if (!target) return
      target.status = 'done'
      target.completedAt = new Date(this.now()).toISOString()
      if (acceptedAt) {
        target.responseSeconds = Math.max(1, Math.round(
          (this.now() - new Date(acceptedAt).getTime()) / 1000,
        ))
      }
      const room = next.rooms.find(item => item.id === target.roomId)
      if (room && room.state === ROOM_STATE.CALLING) room.state = ROOM_STATE.SAFE
    })
    const timer = this.callTimers.get(ticketId)
    if (timer) {
      clearTimeout(timer)
      this.callTimers.delete(ticketId)
    }
    return this.callTicket(careId, ticketId)
  }

  callTicket(careId, ticketId) {
    return this.#stateOf(careId).callTickets.find(item => item.id === ticketId) || null
  }

  // 提醒到期：房间进入提醒态，由语音确认或护理员处理。
  raiseReminder(careId, roomId, medication) {
    const id = careId || 'default'
    this.update(id, state => {
      const room = state.rooms.find(item => item.id === roomId)
      if (!room) return
      if (room.state === ROOM_STATE.SAFE) room.state = ROOM_STATE.REMINDER
      room.note = `${medication.time} ${medication.name}`
    })
  }

  confirmMedication(careId, roomId, medicationName) {
    const id = careId || 'default'
    const confirmedAt = new Date(this.now()).toISOString()
    this.update(id, state => {
      const plan = state.medications[roomId]
      if (plan) {
        const today = new Date(this.now()).toISOString().slice(0, 10)
        plan.confirmations.unshift({
          date: today,
          name: String(medicationName || '').trim(),
          at: confirmedAt,
          by: 'voice',
        })
      }
      const room = state.rooms.find(item => item.id === roomId)
      if (room) {
        room.state = ROOM_STATE.SAFE
        room.note = ''
      }
    })
    return { confirmedAt, roomId }
  }

  activitySignup(careId, activityId, residentName) {
    const id = careId || 'default'
    let result = null
    this.update(id, state => {
      const activity = state.activities.find(item => item.id === activityId || item.title === activityId)
      if (!activity) return
      if (!activity.attendees.includes(residentName)) activity.attendees.push(residentName)
      result = { activityId: activity.id, title: activity.title, attendees: activity.attendees.length }
    })
    if (!result) throw new Error(`未知活动：${activityId}`)
    return result
  }

  setMedia(careId, { playing, channel, station }) {
    const id = careId || 'default'
    this.update(id, state => {
      state.media = {
        playing: playing === true,
        channel: String(channel || ''),
        station: String(station || ''),
      }
    })
  }
}
