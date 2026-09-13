// 晚晴伴状态存储：老人档案、SOS 升级链路、问安记录、提醒、通知。
import { randomUUID } from 'node:crypto'

export const SOS_WINDOW_MS = 30 * 1000
export const CHECKIN_NOANSWER_MS = 60 * 1000

function matchMediaChannel(query = '') {
  const text = String(query || '')
  if (/(豫剧|梆子)/u.test(text)) return { channel: '豫剧选段' }
  if (/(秦腔)/u.test(text)) return { channel: '秦腔经典' }
  if (/(京剧|京戏)/u.test(text)) return { channel: '京剧经典' }
  if (/(黄梅戏)/u.test(text)) return { channel: '黄梅戏精选' }
  if (/(评书|相声)/u.test(text)) return { channel: '单田芳评书' }
  if (/(歌|音乐|曲)/u.test(text)) return { channel: text || '怀旧金曲' }
  return { channel: text || '经典戏曲' }
}

function seedElder(now) {
  return {
    name: '张秀兰',
    address: '张阿姨',
    age: 78,
    mood: '不错',
    lastVoiceAt: new Date(now() - 3600 * 1000).toISOString(),
    likes: ['秦腔', '养花', '和楼下老姐妹聊天'],
    contacts: [
      { name: '小雨', relation: '女儿', phone: '138****0000', level: 1 },
      { name: '小林', relation: '儿子', phone: '139****1111', level: 2 },
    ],
  }
}

function seedVitals(now) {
  const morning = new Date(now())
  morning.setHours(7, 30, 0, 0)
  return {
    bloodPressure: { at: morning.toISOString(), systolic: 136, diastolic: 84 },
    bloodSugar: { at: morning.toISOString(), value: 6.2, stage: '空腹' },
    heartRate: { at: morning.toISOString(), value: 76 },
  }
}

function seedReminders(now) {
  const morning = new Date(now())
  morning.setHours(8, 0, 0, 0)
  return [
    { id: 'med-am', kind: 'medication', name: '降压药', time: '08:00', note: '1 片，早餐后', confirmedAt: new Date(morning.getTime() + 12 * 60 * 1000).toISOString() },
    { id: 'med-noon', kind: 'medication', name: '钙片', time: '12:30', note: '2 片', confirmedAt: '' },
    { id: 'walk-1530', kind: 'activity', name: '起来走走', time: '15:30', note: '昨天说腰酸', confirmedAt: '' },
  ]
}

function initialState(now) {
  return {
    version: 0,
    elder: seedElder(now),
    reminders: seedReminders(now),
    vitals: seedVitals(now),
    familyReminders: [],
    familyMessages: [],
    checkin: {
      time: '09:00',
      today: {
        date: new Date(now()).toISOString().slice(0, 10),
        status: 'done',
        at: new Date(now() - 3600 * 1000).toISOString(),
        mood: '不错',
        notes: '提到腰有点酸',
      },
    },
    sos: null,
    notifications: [
      {
        id: `n-${randomUUID().slice(0, 8)}`,
        kind: 'checkin_ok',
        level: 'info',
        title: '今早问安完成',
        text: '09:02 问安完成，提到腰有点酸',
        at: new Date(now() - 3500 * 1000).toISOString(),
        ackAt: '',
        ackBy: '',
      },
    ],
    media: { playing: false, channel: '' },
    weather: { summary: '多云 18-24°', airQuality: '良' },
  }
}

export class HomeStateStore {
  constructor({ now = Date.now } = {}) {
    this.now = now
    this.states = new Map()
    this.listeners = new Map()
    this.timers = new Map()
  }

  #stateOf(homeId) {
    const id = homeId || 'default'
    if (!this.states.has(id)) this.states.set(id, initialState(this.now))
    return this.states.get(id)
  }

  snapshot(homeId = 'default') {
    return structuredClone(this.#stateOf(homeId))
  }

  subscribe(homeId, listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function')
    const id = homeId || 'default'
    const listeners = this.listeners.get(id) || new Set()
    listeners.add(listener)
    this.listeners.set(id, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.listeners.delete(id)
    }
  }

  reset(homeId = 'default') {
    const id = homeId || 'default'
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.states.set(id, initialState(this.now))
    this.#publish(id, { kind: 'reset' })
    return this.snapshot(id)
  }

  update(homeId, recipe) {
    const id = homeId || 'default'
    const state = this.#stateOf(id)
    const before = state.version
    recipe(state)
    state.version = before + 1
    this.#publish(id, { kind: 'state', version: state.version })
    return this.snapshot(id)
  }

  #publish(homeId, event) {
    const id = homeId || 'default'
    const published = Object.freeze({
      type: 'home.state',
      homeId: id,
      at: new Date().toISOString(),
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

  #notify(homeId, notification) {
    const id = homeId || 'default'
    this.update(id, state => {
      state.notifications.unshift(notification)
    })
    this.#publish(id, {
      kind: 'notification',
      level: notification.level,
      title: notification.title,
    })
  }

  touchVoice(homeId, notes = '') {
    const id = homeId || 'default'
    this.update(id, state => {
      state.elder.lastVoiceAt = new Date(this.now()).toISOString()
      if (notes) state.checkin.today.notes = notes
    })
  }

  // —— SOS 升级链路 ——
  triggerSos(homeId, { reason = '紧急求助', source = 'voice' } = {}) {
    const id = homeId || 'default'
    const state = this.#stateOf(id)
    if (state.sos && state.sos.status === 'active') {
      return structuredClone(state.sos)
    }
    const level1 = state.elder.contacts.find(contact => contact.level === 1)
      || state.elder.contacts[0]
    const sos = {
      id: `sos-${randomUUID().slice(0, 8)}`,
      reason,
      source,
      status: 'active',
      startedAt: new Date(this.now()).toISOString(),
      timeline: [{
        at: new Date(this.now()).toISOString(),
        text: `已通知${level1.relation}${level1.name}`,
      }],
      notified: [{ contact: level1, at: new Date(this.now()).toISOString(), ackAt: '' }],
    }
    this.update(id, next => {
      next.sos = sos
    })
    this.#notify(id, {
      id: `n-${randomUUID().slice(0, 8)}`,
      kind: 'sos',
      level: 'urgent',
      title: `⚠️ ${state.elder.name} 紧急求助`,
      text: `${reason}（${source === 'button' ? '按下 SOS 按钮' : '语音呼救'}）· 已通知${level1.relation}${level1.name}`,
      at: new Date(this.now()).toISOString(),
      ackAt: '',
      ackBy: '',
    })
    const timer = setTimeout(() => {
      this.timers.delete(`${sos.id}-l2`)
      this.#escalateSos(id, sos.id)
    }, SOS_WINDOW_MS)
    timer.unref?.()
    this.timers.set(`${sos.id}-l2`, timer)
    return structuredClone(sos)
  }

  #escalateSos(homeId, sosId) {
    const id = homeId || 'default'
    const state = this.#stateOf(id)
    const sos = state.sos
    if (!sos || sos.id !== sosId || sos.status !== 'active') return
    const acknowledged = sos.notified.some(entry => entry.ackAt)
    if (acknowledged) return
    const level2 = state.elder.contacts.find(contact => contact.level === 2)
    if (!level2) return
    this.update(id, next => {
      const target = next.sos
      if (!target || target.id !== sosId) return
      target.timeline.push({
        at: new Date(this.now()).toISOString(),
        text: `30 秒未回应，已改通知${level2.relation}${level2.name}`,
      })
      target.notified.push({ contact: level2, at: new Date(this.now()).toISOString(), ackAt: '' })
    })
    this.#notify(id, {
      id: `n-${randomUUID().slice(0, 8)}`,
      kind: 'sos_escalated',
      level: 'urgent',
      title: `⚠️ ${state.elder.name} 求助升级`,
      text: `一级联系人 30 秒未响应，已通知${level2.relation}${level2.name}`,
      at: new Date(this.now()).toISOString(),
      ackAt: '',
      ackBy: '',
    })
  }

  ackSos(homeId, byName) {
    const id = homeId || 'default'
    const state = this.#stateOf(id)
    const sos = state.sos
    if (!sos || sos.status !== 'active') return null
    const contact = sos.notified.find(entry => !entry.ackAt)
    this.update(id, next => {
      const target = next.sos
      if (!target || target.status !== 'active') return
      const pending = target.notified.find(entry => !entry.ackAt)
      if (pending) {
        pending.ackAt = new Date(this.now()).toISOString()
        pending.ackBy = String(byName || pending.contact.name)
      }
      target.status = 'acknowledged'
      target.timeline.push({
        at: new Date(this.now()).toISOString(),
        text: `${pending?.contact?.name || byName || '家属'}已经看到了`,
      })
    })
    this.#notify(id, {
      id: `n-${randomUUID().slice(0, 8)}`,
      kind: 'sos_ack',
      level: 'info',
      title: '求助已响应',
      text: `${contact?.contact?.name || byName || '家属'} 已确认看到求助`,
      at: new Date(this.now()).toISOString(),
      ackAt: '',
      ackBy: '',
    })
    const timer = this.timers.get(`${sos.id}-l2`)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(`${sos.id}-l2`)
    }
    return this.snapshot(id).sos
  }

  resolveSos(homeId) {
    const id = homeId || 'default'
    this.update(id, state => {
      if (state.sos) {
        state.sos.status = 'resolved'
        state.sos.timeline.push({
          at: new Date(this.now()).toISOString(),
          text: '求助处理完毕',
        })
      }
    })
  }

  // —— 问安 ——
  startCheckin(homeId, { notes = '' } = {}) {
    const id = homeId || 'default'
    const today = new Date(this.now()).toISOString().slice(0, 10)
    this.update(id, state => {
      state.checkin.today = {
        date: today,
        status: 'in_progress',
        at: new Date(this.now()).toISOString(),
        mood: '',
        notes,
      }
    })
    this.#notify(id, {
      id: `n-${randomUUID().slice(0, 8)}`,
      kind: 'checkin_started',
      level: 'info',
      title: '开始问安',
      text: '晚晴伴正在陪妈妈聊天',
      at: new Date(this.now()).toISOString(),
      ackAt: '',
      ackBy: '',
    })
  }

  completeCheckin(homeId, { mood = '不错', notes = '' } = {}) {
    const id = homeId || 'default'
    this.update(id, state => {
      const today = state.checkin.today
      today.status = 'done'
      today.at = new Date(this.now()).toISOString()
      today.mood = mood
      if (notes) today.notes = notes
      state.elder.mood = mood
      state.elder.lastVoiceAt = new Date(this.now()).toISOString()
    })
    this.#notify(id, {
      id: `n-${randomUUID().slice(0, 8)}`,
      kind: 'checkin_ok',
      level: 'info',
      title: '问安完成 ✓',
      text: `心情：${mood}${notes ? ` · ${notes}` : ''}`,
      at: new Date(this.now()).toISOString(),
      ackAt: '',
      ackBy: '',
    })
  }

  missCheckin(homeId) {
    const id = homeId || 'default'
    this.update(id, state => {
      state.checkin.today.status = 'no_answer'
      state.checkin.today.at = new Date(this.now()).toISOString()
    })
    this.#notify(id, {
      id: `n-${randomUUID().slice(0, 8)}`,
      kind: 'no_answer',
      level: 'urgent',
      title: '问安无应答',
      text: '问安响铃 60 秒无人应答，建议给妈妈打个电话看看',
      at: new Date(this.now()).toISOString(),
      ackAt: '',
      ackBy: '',
    })
  }

  confirmReminder(homeId, reminderName) {
    const id = homeId || 'default'
    let matched = null
    this.update(id, state => {
      const reminder = state.reminders.find(item => (
        item.name.includes(reminderName) || reminderName.includes(item.name)
      )) || state.reminders.find(item => !item.confirmedAt)
      if (reminder) {
        reminder.confirmedAt = new Date(this.now()).toISOString()
        matched = reminder
      }
    })
    if (matched) {
      this.#notify(id, {
        id: `n-${randomUUID().slice(0, 8)}`,
        kind: 'reminder_ok',
        level: 'info',
        title: '提醒已确认',
        text: `${matched.name} 已确认（${matched.time}）`,
        at: new Date(this.now()).toISOString(),
        ackAt: '',
        ackBy: '',
      })
    }
    return matched
  }

  setMedia(homeId, { playing, channel }) {
    const id = homeId || 'default'
    this.update(id, state => {
      state.media = { playing: playing === true, channel: String(channel || '') }
    })
  }

  // —— 家属照护注入：点歌 / 语音提醒 / 留言 ——
  #publishFamilyEvent(homeId, event) {
    const id = homeId || 'default'
    const published = Object.freeze({
      type: 'home.activity',
      homeId: id,
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

  familyMedia(homeId, { query, byName, relation }) {
    const id = homeId || 'default'
    const matched = matchMediaChannel(query)
    this.setMedia(id, { playing: true, channel: matched.channel })
    const event = {
      kind: 'family_media',
      channel: matched.channel,
      by: `${relation || '家属'}${byName || ''}`,
      message: `${relation || '家人'}${byName || ''}为您点了${matched.channel}`,
    }
    this.#publishFamilyEvent(id, event)
    return event
  }

  familyReminder(homeId, { text, byName, relation }) {
    const id = homeId || 'default'
    const state = this.#stateOf(id)
    const reminder = {
      id: `fr-${randomUUID().slice(0, 8)}`,
      text: String(text || '').trim(),
      by: `${relation || '家属'}${byName || ''}`,
      at: new Date(this.now()).toISOString(),
      confirmedAt: '',
    }
    this.update(id, next => {
      next.reminders.unshift({
        id: reminder.id,
        kind: 'family',
        name: reminder.text,
        time: new Date(this.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        note: `来自${reminder.by}`,
        confirmedAt: '',
      })
    })
    this.#publishFamilyEvent(id, {
      kind: 'family_reminder',
      reminderId: reminder.id,
      text: reminder.text,
      by: reminder.by,
      message: `${reminder.by}提醒您：${reminder.text}`,
    })
    return reminder
  }

  familyMessage(homeId, { text, byName, relation }) {
    const id = homeId || 'default'
    const state = this.#stateOf(id)
    const message = {
      id: `fm-${randomUUID().slice(0, 8)}`,
      text: String(text || '').trim(),
      by: `${relation || '家属'}${byName || ''}`,
      at: new Date(this.now()).toISOString(),
    }
    this.update(id, next => {
      next.familyMessages.unshift(message)
    })
    this.#publishFamilyEvent(id, {
      kind: 'family_message',
      messageId: message.id,
      text: message.text,
      by: message.by,
      message: `${message.by}给您留言：${message.text}`,
    })
    return message
  }
}
