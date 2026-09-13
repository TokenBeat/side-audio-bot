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

function matchMediaChannel(query = '') {
  const text = String(query || '')
  if (/(豫剧|梆子)/u.test(text)) return { channel: '豫剧选段', station: '戏曲频道' }
  if (/(秦腔)/u.test(text)) return { channel: '秦腔经典', station: '戏曲频道' }
  if (/(京剧|京戏)/u.test(text)) return { channel: '京剧经典', station: '戏曲频道' }
  if (/(黄梅戏)/u.test(text)) return { channel: '黄梅戏精选', station: '戏曲频道' }
  if (/(评书|相声)/u.test(text)) return { channel: '单田芳评书', station: '曲艺频道' }
  if (/(歌|音乐|曲)/u.test(text)) return { channel: text || '怀旧金曲', station: '音乐频道' }
  return { channel: text || '经典戏曲', station: '戏曲频道' }
}

function seedRooms(now) {
  return [
    { id: '301', bed: '1 床', resident: { name: '王秀英', address: '王奶奶', age: 82, likes: ['豫剧', '红烧鱼', '饭后散步'], family: [{ name: '小芳', relation: '女儿' }] }, state: ROOM_STATE.SAFE, note: '' },
    { id: '302', bed: '1 床', resident: { name: '李建国', address: '李爷爷', age: 79, likes: ['评书', '下象棋', '喝茶'], family: [{ name: '李伟', relation: '儿子' }] }, state: ROOM_STATE.SAFE, note: '' },
    { id: '303', bed: '2 床', resident: { name: '张桂兰', address: '张奶奶', age: 86, likes: ['合唱', '织毛衣', '甜食'], family: [{ name: '小敏', relation: '女儿' }] }, state: ROOM_STATE.SAFE, note: '' },
    { id: '304', bed: '1 床', resident: { name: '陈阿婆', address: '陈阿婆', age: 88, likes: ['黄梅戏', '晒太阳'], family: [{ name: '阿俊', relation: '孙子' }] }, state: ROOM_STATE.SAFE, note: '' },
    { id: '305', bed: '2 床', resident: { name: '赵德福', address: '赵爷爷', age: 75, likes: ['京剧', '读报', '遛弯'], family: [{ name: '赵磊', relation: '儿子' }] }, state: ROOM_STATE.SAFE, note: '' },
    { id: '306', bed: '1 床', resident: { name: '孙玉梅', address: '孙奶奶', age: 83, likes: ['秦腔', '养花'], family: [{ name: '孙悦', relation: '女儿' }] }, state: ROOM_STATE.SAFE, note: '' },
  ]
}

function seedMedications(now) {
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

// —— 生命体征：每日测量数据（机构版的核心资产）——
// 异常阈值：血压 ≥140/90 偏高、<90/60 偏低；空腹血糖 >7.0 偏高、<3.9 偏低；
// 心率 <60 或 >100；血氧 <93；体温 ≥37.3。
function seedVitals(now) {
  const today = new Date(now())
  const day = offset => {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    return date.toISOString().slice(0, 10)
  }
  const measure = (offset, hour, minute) => {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    date.setHours(hour, minute, 0, 0)
    return date.toISOString()
  }
  const morning = measure(0, 7, 30)
  return {
    '301': {
      '2026-09-11': { bloodPressure: [{ at: measure(2, 7, 40), systolic: 142, diastolic: 88 }], bloodSugar: [{ at: measure(2, 7, 40), value: 5.8, stage: '空腹' }] },
      [day(1)]: { bloodPressure: [{ at: measure(1, 7, 35), systolic: 138, diastolic: 85 }], bloodSugar: [{ at: measure(1, 7, 35), value: 5.9, stage: '空腹' }] },
      [day(0)]: { bloodPressure: [{ at: morning, systolic: 134, diastolic: 82 }], bloodSugar: [{ at: morning, value: 5.6, stage: '空腹' }], heartRate: [{ at: morning, value: 74 }], bloodOxygen: [{ at: morning, value: 97 }] },
    },
    '302': {
      [day(1)]: { bloodSugar: [{ at: measure(1, 7, 20), value: 7.4, stage: '空腹' }] },
      [day(0)]: { bloodPressure: [{ at: morning, systolic: 128, diastolic: 78 }], bloodSugar: [{ at: morning, value: 6.8, stage: '空腹' }], heartRate: [{ at: morning, value: 70 }], bloodOxygen: [{ at: morning, value: 98 }] },
    },
    '303': {
      [day(0)]: { bloodPressure: [{ at: morning, systolic: 126, diastolic: 76 }], bloodSugar: [{ at: morning, value: 5.2, stage: '空腹' }], heartRate: [{ at: morning, value: 68 }], bloodOxygen: [{ at: morning, value: 97 }] },
    },
    '304': {
      [day(0)]: { bloodPressure: [{ at: morning, systolic: 132, diastolic: 80 }], heartRate: [{ at: morning, value: 82 }], bloodOxygen: [{ at: morning, value: 96 }] },
    },
    '305': {
      [day(0)]: { bloodPressure: [{ at: morning, systolic: 124, diastolic: 76 }], bloodSugar: [{ at: morning, value: 5.4, stage: '空腹' }], heartRate: [{ at: morning, value: 66 }], bloodOxygen: [{ at: morning, value: 98 }] },
    },
    // 演示线：306 血压偏高，触发大屏健康预警
    '306': {
      [day(2)]: { bloodPressure: [{ at: measure(2, 7, 30), systolic: 148, diastolic: 90 }] },
      [day(1)]: { bloodPressure: [{ at: measure(1, 7, 28), systolic: 155, diastolic: 92 }] },
      [day(0)]: { bloodPressure: [{ at: morning, systolic: 162, diastolic: 95 }], bloodSugar: [{ at: morning, value: 5.7, stage: '空腹' }], heartRate: [{ at: morning, value: 88 }], bloodOxygen: [{ at: morning, value: 95 }] },
    },
  }
}

const VITAL_RANGES = {
  bloodPressure: { label: '血压', unit: '', assess: entry => {
    const { systolic, diastolic } = entry
    if (systolic >= 140 || diastolic >= 90) return { level: 'high', text: '偏高' }
    if (systolic < 90 || diastolic < 60) return { level: 'low', text: '偏低' }
    return { level: 'normal', text: '正常' }
  } },
  bloodSugar: { label: '血糖', unit: 'mmol/L', assess: entry => {
    const value = Number(entry.value)
    if (value > 7) return { level: 'high', text: '偏高' }
    if (value < 3.9) return { level: 'low', text: '偏低' }
    return { level: 'normal', text: '正常' }
  } },
  heartRate: { label: '心率', unit: '次/分', assess: entry => {
    const value = Number(entry.value)
    if (value > 100) return { level: 'high', text: '偏快' }
    if (value < 60) return { level: 'low', text: '偏慢' }
    return { level: 'normal', text: '正常' }
  } },
  bloodOxygen: { label: '血氧', unit: '%', assess: entry => {
    const value = Number(entry.value)
    if (value < 93) return { level: 'low', text: '偏低' }
    return { level: 'normal', text: '正常' }
  } },
}

export function assessVital(kind, entry) {
  const range = VITAL_RANGES[kind]
  if (!range) return { level: 'normal', text: '' }
  return { kind, label: range.label, unit: range.unit, ...range.assess(entry) }
}

export function latestVitalsOf(vitalsByDay) {
  if (!vitalsByDay) return null
  const days = Object.keys(vitalsByDay).sort()
  const latestDay = days[days.length - 1]
  if (!latestDay) return null
  const dayData = vitalsByDay[latestDay]
  const latest = {}
  for (const [kind, entries] of Object.entries(dayData)) {
    if (Array.isArray(entries) && entries.length) {
      latest[kind] = entries[entries.length - 1]
    }
  }
  return { date: latestDay, measurements: latest, historyDays: days.length }
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

function seedMeals(now) {
  return {
    [new Date(now()).toISOString().slice(0, 10)]: {
      breakfast: ['小米粥', '鸡蛋羹', '拌黄瓜'],
      lunch: ['红烧鱼', '清炒时蔬', '米饭', '番茄蛋汤'],
      dinner: ['南瓜粥', '素三鲜包子'],
    },
  }
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
    vitals: seedVitals(now),
    duty: seedDuty(now),
    activities: seedActivities(now),
    meals: seedMeals(now),
    familyReminders: [],
    familyMessages: [],
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

  // —— 生命体征：录入与查询 ——
  latestVitals(careId, roomId) {
    const id = careId || 'default'
    const state = this.#stateOf(id)
    return latestVitalsOf(state.vitals[roomId])
  }

  recordVital(careId, { roomId, kind, entry }) {
    const id = careId || 'default'
    const room = this.room(id, roomId)
    if (!room) throw new Error(`未知房间：${roomId}`)
    if (!VITAL_RANGES[kind]) throw new Error(`未知体征类型：${kind}`)
    const assessment = assessVital(kind, entry)
    const recordedAt = entry.at || new Date(this.now()).toISOString()
    const today = recordedAt.slice(0, 10)
    this.update(id, state => {
      state.vitals[roomId] ||= {}
      state.vitals[roomId][today] ||= {}
      state.vitals[roomId][today][kind] ||= []
      state.vitals[roomId][today][kind].push({ ...entry, at: recordedAt })
    })
    const record = { ...entry, at: recordedAt }
    return {
      room: room.id,
      resident: room.resident.name,
      kind,
      label: VITAL_RANGES[kind].label,
      unit: VITAL_RANGES[kind].unit,
      record,
      assessment,
      abnormal: assessment.level !== 'normal',
    }
  }

  // —— 家属照护注入：点歌 / 语音提醒 / 留言 ——
  // 终端通过 SSE 活动事件收到 kind，自动开口转达 + 展示卡片。
  familyMedia(careId, { roomId, query, byName, relation }) {
    const id = careId || 'default'
    const room = this.room(id, roomId)
    if (!room) throw new Error(`未知房间：${roomId}`)
    const matched = matchMediaChannel(query)
    this.setMedia(id, { playing: true, channel: matched.channel, station: matched.station })
    const event = {
      kind: 'family_media',
      roomId: room.id,
      channel: matched.channel,
      by: `${relation || '家属'}${byName || ''}`,
      message: `${relation || '家人'}${byName || ''}为您点了${matched.channel}`,
    }
    this.#publishFamilyEvent(id, event)
    return event
  }

  familyReminder(careId, { roomId, text, byName, relation }) {
    const id = careId || 'default'
    const room = this.room(id, roomId)
    if (!room) throw new Error(`未知房间：${roomId}`)
    const reminder = {
      id: `fr-${randomUUID().slice(0, 8)}`,
      roomId: room.id,
      text: String(text || '').trim(),
      by: `${relation || '家属'}${byName || ''}`,
      at: new Date(this.now()).toISOString(),
      confirmedAt: '',
    }
    this.update(id, state => {
      state.familyReminders.unshift(reminder)
    })
    this.#publishFamilyEvent(id, {
      kind: 'family_reminder',
      roomId: room.id,
      reminderId: reminder.id,
      text: reminder.text,
      by: reminder.by,
      message: `${reminder.by}提醒您：${reminder.text}`,
    })
    return reminder
  }

  familyMessage(careId, { roomId, text, byName, relation }) {
    const id = careId || 'default'
    const room = this.room(id, roomId)
    if (!room) throw new Error(`未知房间：${roomId}`)
    const message = {
      id: `fm-${randomUUID().slice(0, 8)}`,
      roomId: room.id,
      text: String(text || '').trim(),
      by: `${relation || '家属'}${byName || ''}`,
      at: new Date(this.now()).toISOString(),
    }
    this.update(id, state => {
      state.familyMessages.unshift(message)
    })
    this.#publishFamilyEvent(id, {
      kind: 'family_message',
      roomId: room.id,
      messageId: message.id,
      text: message.text,
      by: message.by,
      message: `${message.by}给您留言：${message.text}`,
    })
    return message
  }

  confirmFamilyReminder(careId, reminderId) {
    const id = careId || 'default'
    this.update(id, state => {
      const reminder = state.familyReminders.find(item => item.id === reminderId)
      if (reminder && !reminder.confirmedAt) {
        reminder.confirmedAt = new Date(this.now()).toISOString()
      }
    })
  }

  #publishFamilyEvent(careId, event) {
    const id = careId || 'default'
    const published = Object.freeze({
      type: 'care.activity',
      careId: id,
      at: new Date().toISOString(),
      category: 'family',
      status: event.kind,
      message: event.message,
      ...event,
    })
    for (const listener of this.listeners.get(id) || []) {
      try {
        listener(published)
      } catch {
        // 观察者不能影响照护操作。
      }
    }
  }

  // 全院健康预警：今天/近两天里所有非正常体征。
  healthAlerts(careId) {
    const id = careId || 'default'
    const state = this.#stateOf(id)
    const alerts = []
    for (const room of state.rooms) {
      const byDay = state.vitals[room.id] || {}
      const days = Object.keys(byDay).sort()
      const latestDay = days[days.length - 1]
      if (!latestDay) continue
      for (const [kind, entries] of Object.entries(byDay[latestDay])) {
        if (!Array.isArray(entries) || !entries.length) continue
        const entry = entries[entries.length - 1]
        const assessment = assessVital(kind, entry)
        if (assessment.level === 'normal') continue
        alerts.push({
          roomId: room.id,
          resident: room.resident.name,
          kind,
          label: assessment.label,
          entry,
          assessment,
          at: entry.at,
        })
      }
    }
    return alerts.sort((a, b) => (a.at < b.at ? 1 : -1))
  }
}
