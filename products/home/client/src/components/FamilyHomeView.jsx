// 家属端（晚晴伴）：老人的全貌仪表盘 + 照护注入。
// 健康、问安、提醒、喜好一屏可见；点歌/语音提醒/留言从这里传到老人终端，
// 由终端的 AI 开口转达——照护的心既要被看到，也要传过去。
import { useMemo, useState } from 'react'
import { Heart, CircleDot, Sun, Pill, Phone, HeartHandshake, Music, AlarmClock, MessageCircleHeart, Check, TriangleAlert, NotebookText } from 'lucide-react'
import useHomeState from '../hooks/useHomeState'

const CHECKIN_STATUS = {
  done: '问安完成',
  in_progress: '正在问安…',
  no_answer: '问安无应答',
}

const SONG_CHOICES = ['秦腔经典', '豫剧选段', '京剧经典', '评书', '怀旧金曲']


// 周报卡：近 7 天问安/体征/提醒完成度一屏回看。
function WeeklyCard({ weekly }) {
  if (!weekly?.length) return null
  const doneCount = weekly.filter(day => day.checkin?.status === 'done').length
  const missed = weekly.filter(day => day.checkin?.status !== 'done')
  const systolics = weekly.map(day => day.vitals?.systolic).filter(value => value != null)
  const bpMin = Math.min(...systolics) - 4
  const bpMax = Math.max(...systolics) + 4
  const width = 560
  const height = 54
  const step = systolics.length > 1 ? (width - 40) / (systolics.length - 1) : 0
  const bpPath = systolics.map((value, index) => {
    const x = 20 + index * step
    const y = height - 12 - ((value - bpMin) / (bpMax - bpMin)) * (height - 24)
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const weekday = date => ['日', '一', '二', '三', '四', '五', '六'][new Date(`${date}T12:00:00`).getDay()]
  return (
    <section className="family-panel weekly-card">
      <h3><NotebookText className="icon-inline" size={17} /> 这一周</h3>
      <div className="weekly-checkin">
        <span className="weekly-row-label">问安</span>
        {weekly.map((day, index) => (
          <span
            key={day.date}
            className={`weekly-dot ${day.checkin?.status === 'done' ? 'ok' : 'miss'}`}
            title={`${day.date} ${day.checkin?.status === 'done' ? `问安顺利（${day.checkin?.mood || '状态好'}）` : '未接通'}`}
          >
            {weekday(day.date)}
          </span>
        ))}
        <span className="weekly-note">{doneCount}/7 天顺利{missed.length ? '，未接通已回访' : ''}</span>
      </div>
      <div className="weekly-bp">
        <span className="weekly-row-label">血压</span>
        <svg viewBox={`0 0 ${width} ${height}`} className="weekly-bp-svg" aria-label="7 天血压走势">
          <path d={bpPath} fill="none" strokeWidth={2.4} className="weekly-bp-line" />
          {systolics.map((value, index) => {
            const x = 20 + index * step
            const y = height - 12 - ((value - bpMin) / (bpMax - bpMin)) * (height - 24)
            return <circle key={index} cx={x} cy={y} r={3.5} className="weekly-bp-dot" />
          })}
        </svg>
        <span className="weekly-note">{Math.min(...systolics)}~{Math.max(...systolics)} mmHg</span>
      </div>
      <div className="weekly-reminders">
        <span className="weekly-row-label">提醒</span>
        {weekly.map(day => (
          <span key={day.date} className="weekly-bar" title={`${day.reminders?.confirmed}/${day.reminders?.total}`}>
            <i style={{ height: `${((day.reminders?.confirmed || 0) / (day.reminders?.total || 3)) * 100}%` }} />
          </span>
        ))}
        <span className="weekly-note">
          完成 {weekly.reduce((sum, day) => sum + (day.reminders?.confirmed || 0), 0)}/{weekly.reduce((sum, day) => sum + (day.reminders?.total || 0), 0)} 项
        </span>
      </div>
    </section>
  )
}

export default function FamilyHomeView() {
  const { state, activities, connected } = useHomeState()
  const [busy, setBusy] = useState(false)
  const [reminderText, setReminderText] = useState('')
  const [messageText, setMessageText] = useState('')
  const [flash, setFlash] = useState('')

  const elder = state?.elder
  const sos = state?.sos
  const sosActive = sos?.status === 'active'
  const today = state?.checkin?.today
  const vitals = state?.vitals

  const flashMessage = text => {
    setFlash(text)
    setTimeout(() => setFlash(''), 2600)
  }

  const send = async (path, body, doneText) => {
    setBusy(true)
    try {
      const response = await fetch(`/api/home/family/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          byName: elder?.contacts?.[0]?.name || '',
          relation: elder?.contacts?.[0]?.relation || '女儿',
          ...body,
        }),
      })
      if (response.ok) flashMessage(doneText)
    } finally {
      setBusy(false)
    }
  }

  const ackSos = async () => {
    setBusy(true)
    try {
      await fetch('/api/home/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'sos_manage', arguments: { action: 'ack', byName: elder?.contacts?.[0]?.name || '家属' } }),
      })
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    return <div className="family-loading">正在连接晚晴伴…</div>
  }

  return (
    <div className="family-view home-family">
      <header className="family-topbar">
        <span className="family-brand">
          <span className="brand-mark">晴</span>
          晚晴伴
        </span>
        <span className={`family-role ${connected ? '' : 'offline'}`}>
          {connected ? '已连接家庭网关' : '连接中…'}
        </span>
      </header>

      {flash && <div className="family-flash"><Check className="icon-inline" size={15} /> {flash}</div>}

      {sosActive && (
        <div className="family-sos-banner">
          <strong><TriangleAlert className="icon-inline" size={16} /> {elder.name} 紧急求助：{sos.reason}</strong>
          <span>已通知：{sos.notified.map(entry => entry.contact.name).join('、')}</span>
          {!sos.notified.some(entry => entry.ackAt) && (
            <button type="button" disabled={busy} onClick={ackSos}>
              我看到了，马上处理
            </button>
          )}
          {sos.notified.some(entry => entry.ackAt) && (
            <em>已确认 · 老人端已显示“家人正在赶来”</em>
          )}
        </div>
      )}

      {/* —— 全貌主卡：今天的人 —— */}
      <section className={`family-status-card ${sosActive || today.status === 'no_answer' ? 'attention' : 'safe'}`}>
        <div className="status-main">
          <span className="status-heart">{sosActive || today.status === 'no_answer' ? <CircleDot size={30} /> : <Heart size={30} />}</span>
          <div>
            <div className="status-name">{elder.name} <span className="status-age">{elder.age}岁</span></div>
            <div className="status-line">
              {sosActive ? '紧急求助处理中' : `此刻平安 · 最近对话 ${new Date(elder.lastVoiceAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`}
            </div>
          </div>
        </div>
        {vitals && (
          <div className="family-vitals">
            <div className="family-vital">
              <span className="fv-label">血压</span>
              <span className="fv-value">{vitals.bloodPressure.systolic}/{vitals.bloodPressure.diastolic}</span>
            </div>
            <div className="family-vital">
              <span className="fv-label">血糖（{vitals.bloodSugar.stage}）</span>
              <span className="fv-value">{vitals.bloodSugar.value}</span>
            </div>
            <div className="family-vital">
              <span className="fv-label">心率</span>
              <span className="fv-value">{vitals.heartRate.value}</span>
            </div>
          </div>
        )}
        <ul className="status-facts">
          <li><Sun className="icon-inline" size={15} /> {CHECKIN_STATUS[today.status] || today.status}：{today.mood || '—'}{today.notes ? ` · ${today.notes}` : ''}</li>
          <li><Pill className="icon-inline" size={15} /> 今日提醒：{state.reminders.filter(item => item.confirmedAt).length}/{state.reminders.length} 已确认</li>
          <li><Phone className="icon-inline" size={15} /> 紧急联系人：{elder.contacts.map(contact => `${contact.relation}${contact.name}`).join('、')}</li>
        </ul>
      </section>

      {/* —— 周报：近 7 天回看 —— */}
      <WeeklyCard weekly={state?.weekly} />

      {/* —— 照护注入 —— */}
      <section className="family-grid">
        <div className="family-panel">
          <h3><HeartHandshake className="icon-inline" size={17} /> 妈妈的喜好</h3>
          <div className="likes-chips">
            {(elder.likes || []).map(like => (
              <span key={like} className="like-chip">{like}</span>
            ))}
          </div>
          <p className="likes-hint">点下面她爱听的，家里终端马上放</p>
        </div>

        <div className="family-panel action">
          <h3><Music className="icon-inline" size={17} /> 点给她听</h3>
          <div className="song-chips">
            {SONG_CHOICES.map(song => (
              <button
                key={song}
                type="button"
                disabled={busy}
                onClick={() => send('media', { query: song }, `已为${elder.address || '妈妈'}点播 ${song}，终端正在放`)}
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
              placeholder="比如：下午三点起来走走"
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
        </div>
      </section>

      <section className="family-quick">
        <button type="button" className="quick-call" disabled={busy}>
          <Phone className="icon-inline" size={16} /> 跟{elder.address || '妈妈'}说说话
        </button>
        <button type="button" className="quick-checkin" disabled={busy} onClick={async () => {
          setBusy(true)
          try {
            await fetch('/api/home/simulate-checkin', { method: 'POST' })
          } finally {
            setBusy(false)
          }
        }}>
          <Sun className="icon-inline" size={16} /> 现在发起一次问安
        </button>
      </section>

      <section className="family-notifications">
        <h2>通知</h2>
        <div className="notification-list">
          {activities.slice(0, 8).map((activity, index) => (
            <div key={`${activity.at}-${index}`} className={`notification-item level-${activity.level || 'info'}`}>
              <span className="notification-time">{activity.at.slice(11, 16)}</span>
              <span className="notification-text">{activity.message}</span>
            </div>
          ))}
          {state.notifications.slice(0, 6).map(notification => (
            <div key={notification.id} className={`notification-item level-${notification.level}`}>
              <span className="notification-time">{notification.at.slice(5, 16).replace('T', ' ')}</span>
              <span className="notification-text">
                <strong>{notification.title}</strong>
                {notification.text ? ` — ${notification.text}` : ''}
              </span>
            </div>
          ))}
        </div>
      </section>

      <footer className="family-footer">
        语音在家庭网关本地处理，只有摘要状态同步到这里。
      </footer>
    </div>
  )
}
