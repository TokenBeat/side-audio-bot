// 房间终端：老人每天面对的界面。
// 布局对标座舱：设备框内左主视觉（3D 陪伴球+大字时钟）+ 右信息列 + 底部圆形 Dock。
import { useEffect, useMemo, useRef, useState } from 'react'
import useVoiceSession from '../hooks/useVoiceSession'
import useCareState from '../hooks/useCareState'
import Orb3D from './Orb3D'

function greeting(now, address) {
  const hour = now.getHours()
  const period = hour < 6 ? '夜深了'
    : hour < 9 ? '早上'
    : hour < 12 ? '上午'
    : hour < 14 ? '中午'
    : hour < 18 ? '下午'
    : '晚上'
  return hour < 6 ? `夜深了，${address}` : `${period}好，${address}`
}

function nextMedication(state, roomId) {
  const plan = state?.medications?.[roomId]
  if (!plan) return null
  const today = new Date().toISOString().slice(0, 10)
  const confirmedNames = new Set(
    plan.confirmations.filter(item => item.date === today).map(item => item.name),
  )
  return plan.items.find(item => !confirmedNames.has(item.name)) || null
}

function medicationCountdown(item, now) {
  if (!item) return null
  const [hours, minutes] = String(item.time || '').split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  const due = new Date(now)
  due.setHours(hours, minutes, 0, 0)
  const diffMinutes = Math.round((due.getTime() - now.getTime()) / 60000)
  if (diffMinutes > 0) {
    const hours = Math.floor(diffMinutes / 60)
    const minutes = diffMinutes % 60
    return `还有 ${hours ? `${hours} 小时` : ''}${minutes ? ` ${minutes} 分` : ''}`.trim()
  }
  return '就是现在'
}

const ORB_STATE_LABEL = {
  idle: '点一下，跟我说话',
  listening: '在听呢，请讲',
  thinking: '想一想…',
  speaking: '我在说',
  error: '语音需要帮助，请按呼叫',
}

export default function RoomTerminal({ roomId = '302' }) {
  const { state, activities } = useCareState()
  const [now, setNow] = useState(() => new Date())
  const [muted, setMuted] = useState(true)
  const [transcript, setTranscript] = useState([])
  const [callStatus, setCallStatus] = useState(null)
  const transcriptRef = useRef(null)

  const room = state?.rooms?.find(item => item.id === roomId)
  const residentName = room?.resident?.name || '爷爷奶奶'
  const address = room?.resident?.address || ''

  const session = useVoiceSession({
    muted,
    clientId: `care-room-${roomId}`,
    clientLabel: `晚晴照护终端 ${roomId}`,
    onVoiceMessage: message => {
      if (message.progress) {
        setTranscript(current => [...current, {
          role: 'system',
          content: message.progress.message || '正在处理…',
          at: Date.now(),
        }])
        return
      }
      if (!message.content && !message.final) return
      setTranscript(current => {
        if (message.delta && message.responseId && current.length) {
          const last = current[current.length - 1]
          if (last.role === message.role && last.responseId === message.responseId) {
            const merged = [...current]
            merged[merged.length - 1] = { ...last, content: message.content }
            return merged
          }
        }
        return [...current, {
          role: message.role,
          content: message.content,
          responseId: message.responseId,
          at: Date.now(),
        }]
      })
    },
  })

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const beat = () => {
      fetch('/api/care/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      }).catch(() => {})
    }
    beat()
    const timer = setInterval(beat, 10_000)
    return () => clearInterval(timer)
  }, [roomId])

  useEffect(() => {
    transcriptRef.current?.scrollTo?.({ top: transcriptRef.current.scrollHeight })
  }, [transcript])

  const activeCall = useMemo(() => (
    state?.callTickets?.find(ticket => (
      ticket.roomId === roomId
      && (ticket.status === 'new' || ticket.status === 'accepted' || ticket.status === 'escalated')
    ))
  ), [state, roomId])

  useEffect(() => {
    if (!activeCall) return
    const staffName = activeCall.acceptedBy
    setCallStatus(activeCall.status === 'accepted'
      ? { tone: 'accepted', text: `${staffName || '护理员'}已经接到了，正在过来` }
      : activeCall.escalated
        ? { tone: 'escalated', text: '已经通知护士长啦，别着急' }
        : { tone: 'new', text: '已经告诉护理员了，马上就到' })
  }, [activeCall])

  useEffect(() => {
    if (!activeCall && callStatus) {
      const timer = setTimeout(() => setCallStatus(null), 12_000)
      return () => clearTimeout(timer)
    }
  }, [activeCall, callStatus])

  const medication = useMemo(() => nextMedication(state, roomId), [state, roomId])
  const medicationDue = medicationCountdown(medication, now)
  const reminderActive = room?.state === 'reminder'

  const toggleVoice = () => {
    if (muted) {
      if (session.activateVoice()) setMuted(false)
    } else {
      setMuted(true)
      session.deactivateVoice()
    }
  }

  const triggerCall = (intent = '呼叫护理员') => {
    fetch('/api/care/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'call_manage',
        arguments: { action: 'create', roomId, intent },
      }),
    }).catch(() => {})
    setCallStatus({ tone: 'new', text: '已经知道了，别着急' })
  }

  const confirmMedication = () => {
    if (!medication) return
    fetch('/api/care/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'medication_confirm',
        arguments: { roomId, medicationName: medication.name },
      }),
    }).catch(() => {})
  }

  const lastLine = transcript[transcript.length - 1]
  const orbState = session.voiceState
  const orbLabel = muted
    ? ORB_STATE_LABEL.idle
    : session.error
      ? session.error
      : ORB_STATE_LABEL[orbState] || ORB_STATE_LABEL.idle

  return (
    <div className="terminal-stage">
      <div className="terminal-frame">
        <header className="frame-topbar">
          <span className="frame-brand">
            <span className="brand-mark">晴</span>
            晚晴·照护
          </span>
          <span className="frame-weather">☁️ 多云 18-24°</span>
          <span className="frame-clock">{now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="frame-date">{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span>
        </header>

        <div className="terminal-columns">
          <section className="hero-panel glass">
            <div className="hero-clock">
              {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="hero-room">{roomId} 房 · {residentName}</div>
            <Orb3D
              state={orbState}
              level={session.inputLevel}
              speakingLevel={session.outputLevel}
              height={330}
            />
            <div className="hero-greeting">{greeting(now, address || residentName)}</div>
            <button type="button" className={`hero-mic ${muted ? '' : 'live'}`} onClick={toggleVoice}>
              {orbLabel}
            </button>
            {(lastLine || callStatus) && (
              <div className="hero-subtitle glass-soft" ref={transcriptRef}>
                {lastLine && (
                  <p className={`line line-${lastLine.role}`}>
                    {lastLine.role === 'user' ? '您' : lastLine.role === 'system' ? '' : '晚晴'}：{lastLine.content}
                  </p>
                )}
                {callStatus && (
                  <p className={`line call-line tone-${callStatus.tone}`}>🔔 {callStatus.text}</p>
                )}
              </div>
            )}
          </section>

          <aside className="info-column">
            <div className={`info-card medication-card ${reminderActive ? 'due' : ''} ${medication ? '' : 'done'}`}>
              <div className="info-card-head">💊 用药提醒</div>
              {medication ? (
                <>
                  <div className="info-card-title">{medication.name}</div>
                  <div className="info-card-sub">{medication.time} · {medication.note}</div>
                  <div className={`info-card-tag ${reminderActive ? 'now' : ''}`}>
                    {reminderActive ? '到时间了' : medicationDue}
                  </div>
                  <button type="button" className="card-action" onClick={confirmMedication}>我吃好了</button>
                </>
              ) : (
                <div className="info-card-title">今天的药都吃好啦 👍</div>
              )}
            </div>

            <div className="info-card call-card">
              <div className="info-card-head">🔔 呼叫护理员</div>
              <div className="info-card-title">有事随时叫我</div>
              <div className="info-card-sub">说话或按下面按钮都行</div>
              {activeCall && (
                <div className="info-card-tag now">
                  {activeCall.status === 'accepted' ? `${activeCall.acceptedBy} 正在过来` : activeCall.escalated ? '已升级护士长' : '护理员马上到'}
                </div>
              )}
            </div>

            <div className="info-card schedule-card">
              <div className="info-card-head">📅 院内安排</div>
              {(state?.activities || []).map(activity => (
                <div key={activity.id} className="schedule-row">
                  <span className="schedule-time">{activity.time}</span>
                  <span className="schedule-title">{activity.title}</span>
                  <span className="schedule-count">{activity.attendees.length} 人</span>
                </div>
              ))}
              <div className="schedule-row soft">
                <span className="schedule-time">{activities[0]?.at?.slice(11, 16) || ''}</span>
                <span className="schedule-title soft">{activities[0]?.message || '一切平安'}</span>
              </div>
            </div>
          </aside>
        </div>

        <footer className="dock">
          <button
            type="button"
            className={`dock-btn mic ${muted ? '' : 'live'}`}
            onClick={toggleVoice}
            aria-label="语音对话开关"
          >
            {muted ? '🎙️' : '🗣️'}
            <span>{muted ? '说话' : '在听'}</span>
          </button>
          <div className="dock-temp">
            <span className="dock-temp-value">{state?.weather?.summary?.match(/\d+°/)?.[0] || '18°'}</span>
            <span className="dock-temp-label">室温舒适</span>
          </div>
          <button
            type="button"
            className={`dock-btn primary call ${activeCall ? 'active' : ''}`}
            onClick={() => triggerCall()}
            aria-label="呼叫护理员"
          >
            🔔
            <span>{activeCall ? '已呼叫' : '呼叫'}</span>
          </button>
          <button
            type="button"
            className={`dock-btn med ${reminderActive ? 'due' : ''}`}
            onClick={confirmMedication}
            aria-label="确认吃药"
          >
            💊
            <span>吃药</span>
          </button>
        </footer>
      </div>
    </div>
  )
}
