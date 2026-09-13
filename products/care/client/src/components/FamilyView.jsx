// 家属端：妈妈/爸爸的"全貌"仪表盘。
// 像座舱展示整车状态一样展示老人：健康、生活、喜好一屏可见；
// 点歌、语音提醒、留言从这里"注入"照护，由终端的 AI 开口转达。
import { useEffect, useMemo, useState } from 'react'
import useCareState from '../hooks/useCareState'
import { Heart, CircleDot, Pill, BellRing, Utensils, HeartHandshake, Music, AlarmClock, MessageCircleHeart, Check } from 'lucide-react'

function latestVitalsOf(vitalsByDay) {
  if (!vitalsByDay) return null
  const days = Object.keys(vitalsByDay).sort()
  const latestDay = days[days.length - 1]
  if (!latestDay) return null
  const measurements = {}
  for (const [kind, entries] of Object.entries(vitalsByDay[latestDay])) {
    if (Array.isArray(entries) && entries.length) measurements[kind] = entries[entries.length - 1]
  }
  return { date: latestDay, measurements }
}

function vitalAssess(kind, entry) {
  if (kind === 'bloodPressure') {
    if (entry.systolic >= 140 || entry.diastolic >= 90) return 'high'
    if (entry.systolic < 90 || entry.diastolic < 60) return 'low'
    return 'normal'
  }
  if (kind === 'bloodSugar') return entry.value > 7 ? 'high' : entry.value < 3.9 ? 'low' : 'normal'
  if (kind === 'heartRate') return entry.value > 100 ? 'high' : entry.value < 60 ? 'low' : 'normal'
  if (kind === 'bloodOxygen') return entry.value < 93 ? 'low' : 'normal'
  return 'normal'
}

const VITAL_LABELS = {
  bloodPressure: '血压',
  bloodSugar: '血糖',
  heartRate: '心率',
  bloodOxygen: '血氧',
}

function vitalValueText(kind, entry) {
  if (kind === 'bloodPressure') return `${entry.systolic}/${entry.diastolic}`
  if (kind === 'bloodOxygen') return `${entry.value}%`
  return `${entry.value}`
}

const SONG_CHOICES = ['豫剧选段', '秦腔经典', '京剧经典', '评书', '怀旧金曲']

export default function FamilyView({ roomId }) {
  const { state, activities, connected } = useCareState()
  const [busy, setBusy] = useState(false)
  const [reminderText, setReminderText] = useState('')
  const [messageText, setMessageText] = useState('')
  const [flash, setFlash] = useState('')

  const room = useMemo(() => (
    state?.rooms?.find(item => item.id === roomId)
      || state?.rooms?.find(item => item.id === '301')
      || state?.rooms?.[0]
  ), [state, roomId])

  const myTickets = useMemo(() => (
    (state?.callTickets || []).filter(ticket => ticket.roomId === room?.id)
  ), [state, room])

  const vitals = useMemo(() => latestVitalsOf(state?.vitals?.[room?.id]), [state, room])
  const todayMeals = useMemo(() => {
    if (!state?.meals) return null
    const today = new Date().toISOString().slice(0, 10)
    return state.meals[today]
  }, [state])

  const medicationToday = useMemo(() => {
    if (!room || !state) return null
    const plan = state.medications?.[room.id]
    if (!plan) return null
    const today = new Date().toISOString().slice(0, 10)
    return {
      items: plan.items,
      confirmed: plan.confirmations.filter(item => item.date === today),
    }
  }, [state, room])

  const isSafe = room?.state === 'safe'

  const flashMessage = text => {
    setFlash(text)
    setTimeout(() => setFlash(''), 2600)
  }

  const send = async (path, body, doneText) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/care/family/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room?.id,
          byName: room?.resident?.family?.[0]?.name || '',
          relation: room?.resident?.family?.[0]?.relation || '家人',
          ...body,
        }),
      })
      if (response.ok) flashMessage(doneText)
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return <div className="family-loading">正在连接晚晴·照护…</div>
  }

  const resident = room?.resident || {}

  return (
    <div className="family-view">
      <header className="family-topbar">
        <span className="family-brand">
          <span className="brand-mark">晴</span>
          晚晴·照护
        </span>
        <span className="family-role">家属端 · {room?.id} 房 · {connected ? '已连接' : '连接中'}</span>
      </header>

      {flash && <div className="family-flash"><Check className="icon-inline" size={15} /> {flash}</div>}

      {/* —— 全貌主卡 —— */}
      <section className={`family-status-card ${isSafe ? 'safe' : 'attention'}`}>
        <div className="status-main">
          <span className="status-heart">{isSafe ? <Heart size={30} /> : <CircleDot size={30} />}</span>
          <div>
            <div className="status-name">{resident.name} <span className="status-age">{resident.age}岁</span></div>
            <div className="status-line">
              {isSafe ? '此刻平安' : room?.state === 'calling' ? '正在呼叫护理员，已受理' : '有待处理的提醒'}
              {' · '}今天心情不错
            </div>
          </div>
        </div>
        {vitals && (
          <div className="family-vitals">
            {Object.entries(vitals.measurements).map(([kind, entry]) => (
              <div key={kind} className={`family-vital ${vitalAssess(kind, entry)}`}>
                <span className="fv-label">{VITAL_LABELS[kind]}</span>
                <span className="fv-value">{vitalValueText(kind, entry)}</span>
              </div>
            ))}
          </div>
        )}
        <ul className="status-facts">
          <li><Pill className="icon-inline" size={15} /> 用药：{medicationToday?.confirmed.length
            ? `今日已确认 ${medicationToday.confirmed.map(item => `${item.name} ${item.at.slice(11, 16)}`).join('、')}`
            : `今日待确认：${medicationToday?.items.map(item => `${item.time} ${item.name}`).join('、') || '无计划'}`}</li>
          <li><BellRing className="icon-inline" size={15} /> 最近呼叫：{myTickets[0]
            ? `${new Date(myTickets[0].createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${myTickets[0].intent}（${myTickets[0].status === 'done' ? '已完成' : myTickets[0].status === 'accepted' ? '处理中' : '待受理'}）`
            : '今天还没有呼叫'}</li>
        </ul>
      </section>

      {/* —— 今日生活：吃饭 + 活动 + 喜好 —— */}
      <section className="family-grid">
        <div className="family-panel">
          <h3><Utensils className="icon-inline" size={17} /> 今天的生活</h3>
          {todayMeals && (
            <div className="meal-block">
              <span className="meal-label">午餐</span>
              <span className="meal-items">{todayMeals.lunch?.join(' · ') || '—'}</span>
            </div>
          )}
          {todayMeals && (
            <div className="meal-block">
              <span className="meal-label">晚餐</span>
              <span className="meal-items">{todayMeals.dinner?.join(' · ') || '—'}</span>
            </div>
          )}
          {(state?.activities || []).map(activity => (
            <div key={activity.id} className="meal-block">
              <span className="meal-label">{activity.time}</span>
              <span className="meal-items">{activity.title}（{activity.attendees.length} 人参加）</span>
            </div>
          ))}
        </div>

        <div className="family-panel">
          <h3><HeartHandshake className="icon-inline" size={17} /> 妈妈的喜好</h3>
          <div className="likes-chips">
            {(resident.likes || []).map(like => (
              <span key={like} className="like-chip">{like}</span>
            ))}
          </div>
          <p className="likes-hint">点下面她爱听的，终端会马上放给她</p>
        </div>
      </section>

      {/* —— 照护注入：点歌 / 提醒 / 留言 —— */}
      <section className="family-grid">
        <div className="family-panel action">
          <h3><Music className="icon-inline" size={17} /> 点给她听</h3>
          <div className="song-chips">
            {SONG_CHOICES.map(song => (
              <button
                key={song}
                type="button"
                disabled={busy}
                onClick={() => send('media', { query: song }, `已为${resident.address || '老人'}点播 ${song}，终端正在放`)}
              >
                <Music className="icon-inline" size={15} /> {song}
              </button>
            ))}
          </div>
        </div>

        <div className="family-panel action">
          <h3><AlarmClock className="icon-inline" size={17} /> 语音提醒</h3>
          <div className="input-row">
            <input
              value={reminderText}
              placeholder="比如：明天降温，记得加衣服"
              onChange={event => setReminderText(event.target.value)}
            />
            <button
              type="button"
              disabled={busy || !reminderText.trim()}
              onClick={() => {
                send('reminder', { text: reminderText }, '提醒已送达，终端会用语音转达')
                setReminderText('')
              }}
            >
              送去
            </button>
          </div>
          <p className="panel-hint">终端会用语音亲口转达，并一直亮到老人确认</p>
        </div>

        <div className="family-panel action">
          <h3><MessageCircleHeart className="icon-inline" size={17} /> 说句心里话</h3>
          <div className="input-row">
            <input
              value={messageText}
              placeholder="比如：妈，周末我带孩子看你"
              onChange={event => setMessageText(event.target.value)}
            />
            <button
              type="button"
              disabled={busy || !messageText.trim()}
              onClick={() => {
                send('message', { text: messageText }, '留言已送达，终端会用语音读给她听')
                setMessageText('')
              }}
            >
              送去
            </button>
          </div>
          <p className="panel-hint">用她的称呼读出来，比微信更近一步</p>
        </div>
      </section>

      <section className="family-notifications">
        <h2>动态</h2>
        <div className="notification-list">
          {activities.slice(0, 12).map((activity, index) => (
            <div key={`${activity.at}-${index}`} className={`notification-item level-${activity.level || 'info'}`}>
              <span className="notification-time">{activity.at.slice(11, 16)}</span>
              <span className="notification-text">{activity.message}</span>
            </div>
          ))}
          {!activities.length && (state.familyMessages?.length || state.familyReminders?.length) ? (
            <>
              {(state.familyMessages || []).slice(0, 3).map(message => (
                <div key={message.id} className="notification-item">
                  <span className="notification-time">{message.at.slice(11, 16)}</span>
                  <span className="notification-text">{message.by}留言：{message.text}</span>
                </div>
              ))}
              {(state.familyReminders || []).filter(item => !item.confirmedAt).slice(0, 3).map(reminder => (
                <div key={reminder.id} className="notification-item">
                  <span className="notification-time">{reminder.at.slice(11, 16)}</span>
                  <span className="notification-text">{reminder.by}提醒：{reminder.text}（待老人确认）</span>
                </div>
              ))}
            </>
          ) : null}
          {!activities.length && !state.familyMessages?.length && !state.familyReminders?.length && (
            <div className="notification-empty">暂时没有新动态</div>
          )}
        </div>
      </section>

      <footer className="family-footer">
        语音在本机构内网本地处理，只有摘要状态同步到这里。
      </footer>
    </div>
  )
}
