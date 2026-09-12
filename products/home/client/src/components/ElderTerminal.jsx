// 老人端：晚晴伴。布局与机构版房间终端同工艺（设备框+3D 陪伴球+圆形 Dock），
// 差异：SOS 长按防误触、问安日出横幅、家属留言位。
import { useEffect, useMemo, useRef, useState } from 'react'
import useVoiceSession from '../hooks/useVoiceSession'
import useHomeState from '../hooks/useHomeState'
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

function checkinGreeting(now) {
  const hour = now.getHours()
  if (hour < 6) return '这么晚还没睡呀，跟我聊聊？'
  if (hour < 11) return '早上好呀，睡得好吗？跟我说说话吧'
  if (hour < 14) return '中午好，今天胃口怎么样？'
  if (hour < 18) return '下午好，喝口水歇一歇，聊两句？'
  return '晚上好呀，今天过得怎么样？'
}

const ORB_STATE_LABEL = {
  idle: '点一下，跟我说话',
  listening: '在听呢，请讲',
  thinking: '想一想…',
  speaking: '我在说',
  error: '语音需要帮助，请长按 SOS',
}

export default function ElderTerminal() {
  const { state } = useHomeState()
  const [now, setNow] = useState(() => new Date())
  const [muted, setMuted] = useState(true)
  const [transcript, setTranscript] = useState([])
  const pressTimerRef = useRef(null)
  const transcriptRef = useRef(null)

  const elder = state?.elder
  const address = elder?.address || ''

  const session = useVoiceSession({
    muted,
    clientId: 'home-elder',
    clientLabel: '晚晴伴老人端',
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
      if (message.role === 'user' && message.final) {
        fetch('/api/home/voice-touch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).catch(() => {})
      }
    },
  })

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const checkin = state?.checkin?.today
  const checkinActive = checkin?.status === 'in_progress'
  const sosActive = state?.sos?.status === 'active'
  const sosAcknowledged = sosActive && state?.sos?.notified?.some(entry => entry.ackAt)
  const pendingReminder = useMemo(() => (
    (state?.reminders || []).find(item => !item.confirmedAt)
  ), [state])

  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (checkinActive && muted && !autoStartedRef.current) {
      autoStartedRef.current = true
      if (session.activateVoice()) setMuted(false)
    }
    if (!checkinActive) autoStartedRef.current = false
  }, [checkinActive, muted, session])

  const startSosPress = () => {
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null
      fetch('/api/home/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'sos_manage',
          arguments: { action: 'trigger', reason: '按下紧急按钮' },
        }),
      }).catch(() => {})
    }, 1200)
  }

  const cancelSosPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  const confirmReminder = () => {
    if (!pendingReminder) return
    fetch('/api/home/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'reminder_confirm',
        arguments: { reminderName: pendingReminder.name },
      }),
    }).catch(() => {})
  }

  const finishCheckin = () => {
    fetch('/api/home/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'checkin_complete', arguments: { mood: '不错', notes: '' } }),
    }).catch(() => {})
  }

  const toggleVoice = () => {
    if (muted) {
      if (session.activateVoice()) setMuted(false)
    } else {
      setMuted(true)
      session.deactivateVoice()
    }
  }

  const lastLine = transcript[transcript.length - 1]
  const orbState = sosActive ? 'speaking' : session.voiceState
  const orbLabel = sosActive
    ? '已经通知家人了'
    : muted
      ? ORB_STATE_LABEL.idle
      : session.error
        ? session.error
        : ORB_STATE_LABEL[session.voiceState] || ORB_STATE_LABEL.idle

  const remindersDone = (state?.reminders || []).filter(item => item.confirmedAt).length

  return (
    <div className="terminal-stage">
      <div className="terminal-frame">
        <header className="frame-topbar">
          <span className="frame-brand">
            <span className="brand-mark">晴</span>
            晚晴伴
          </span>
          <span className="frame-weather">☁️ {state?.weather?.summary || '多云'}</span>
          <span className="frame-clock">{now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="frame-date">{now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span>
        </header>

        <div className="terminal-columns">
          <section className="hero-panel glass">
            <div className="hero-clock">
              {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="hero-room">{elder?.name} · 家里</div>
            <Orb3D
              state={orbState}
              level={session.inputLevel}
              speakingLevel={session.outputLevel}
              height={330}
            />
            <div className="hero-greeting">{greeting(now, address || elder?.name || '')}</div>
            <button type="button" className={`hero-mic ${muted ? '' : 'live'}`} onClick={toggleVoice}>
              {orbLabel}
            </button>
            {checkinActive && (
              <div className="checkin-banner">☀️ {checkinGreeting(now)}</div>
            )}
            {lastLine && !checkinActive && (
              <div className="hero-subtitle glass-soft" ref={transcriptRef}>
                <p className={`line line-${lastLine.role}`}>
                  {lastLine.role === 'user' ? '您' : lastLine.role === 'system' ? '' : '晚晴'}：{lastLine.content}
                </p>
              </div>
            )}
          </section>

          <aside className="info-column">
            <div className={`info-card medication-card ${pendingReminder ? '' : 'done'}`}>
              <div className="info-card-head">💊 接下来的安排</div>
              {pendingReminder ? (
                <>
                  <div className="info-card-title">{pendingReminder.name}</div>
                  <div className="info-card-sub">{pendingReminder.time} · {pendingReminder.note}</div>
                  <button type="button" className="card-action" onClick={confirmReminder}>做好了，点这里</button>
                </>
              ) : (
                <div className="info-card-title">今天的安排都完成啦 👍</div>
              )}
            </div>

            <div className="info-card call-card sos-info">
              <div className="info-card-head">🆘 紧急求助</div>
              <div className="info-card-title">长按下面红色按钮</div>
              <div className="info-card-sub">
                {sosActive
                  ? sosAcknowledged
                    ? `${state.sos.notified.find(entry => entry.ackAt)?.contact?.name || '家人'}已经看到了`
                    : `已通知${state.sos.notified[0]?.relation || '家人'}${state.sos.notified[0]?.contact?.name || ''}`
                  : `家人（${(elder?.contacts || []).map(contact => contact.name).join('、')}）会马上收到`}
              </div>
            </div>

            <div className="info-card schedule-card">
              <div className="info-card-head">🏡 今天</div>
              <div className="schedule-row">
                <span className="schedule-time">问安</span>
                <span className="schedule-title">
                  {checkin?.status === 'done' ? `已完成 ✓ · 心情${checkin.mood}` : checkin?.status === 'in_progress' ? '正在进行…' : '还没开始'}
                </span>
              </div>
              <div className="schedule-row">
                <span className="schedule-time">提醒</span>
                <span className="schedule-title">{remindersDone}/{state?.reminders?.length || 0} 已完成</span>
              </div>
              <div className="schedule-row soft">
                <span className="schedule-title soft">语音在家庭网关本地处理，不会上云。</span>
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
            <span className="dock-temp-label">室内舒适</span>
          </div>
          {checkinActive ? (
            <button type="button" className="dock-btn primary checkin" onClick={finishCheckin} aria-label="完成问安">
              ☀️
              <span>聊好啦</span>
            </button>
          ) : (
            <div className="dock-temp">
              <span className="dock-temp-value">♥</span>
              <span className="dock-temp-label">一切平安</span>
            </div>
          )}
          <button
            type="button"
            className={`dock-btn sos ${sosActive ? 'active' : ''}`}
            onMouseDown={startSosPress}
            onMouseUp={cancelSosPress}
            onMouseLeave={cancelSosPress}
            onTouchStart={startSosPress}
            onTouchEnd={cancelSosPress}
            aria-label="紧急求助"
          >
            🆘
            <span>{sosActive ? '已通知' : '求助'}</span>
          </button>
        </footer>
      </div>
    </div>
  )
}
