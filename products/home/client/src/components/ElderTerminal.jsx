// 老人端：问安、提醒、SOS、日常聊天。大字、大按钮、SOS 长按防误触。
import { useEffect, useMemo, useRef, useState } from 'react'
import useVoiceSession from '../hooks/useVoiceSession'
import useHomeState from '../hooks/useHomeState'
import VoiceOrb from './VoiceOrb'

function greeting(now, address) {
  const hour = now.getHours()
  const period = hour < 6 ? '夜深了'
    : hour < 9 ? '早上好'
    : hour < 12 ? '上午好'
    : hour < 14 ? '中午好'
    : hour < 18 ? '下午好'
    : '晚上好'
  return `${period}，${address}`
}

function checkinGreeting(now) {
  const hour = now.getHours()
  if (hour < 6) return '这么晚还没睡呀，跟我聊聊？'
  if (hour < 11) return '早上好呀，睡得好吗？跟我说说话吧'
  if (hour < 14) return '中午好，今天胃口怎么样？'
  if (hour < 18) return '下午好，喝口水歇一歇，聊两句？'
  return '晚上好呀，今天过得怎么样？'
}

export default function ElderTerminal() {
  const { state } = useHomeState()
  const [now, setNow] = useState(() => new Date())
  const [muted, setMuted] = useState(true)
  const [transcript, setTranscript] = useState([])
  const [sosCountdown, setSosCountdown] = useState(null)
  const pressTimerRef = useRef(null)
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
        // 有应答即认为语音活跃，供家属端"最近对话"展示。
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

  // 问安主动唤起：服务端到点发起时，终端自动开麦进入对话。
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
          arguments: { action: 'trigger', reason: '按下紧急按钮', },
        }),
      }).catch(() => {})
    }, 1200)
    setSosCountdown(1.2)
  }

  const cancelSosPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
      setSosCountdown(null)
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

  const triggerCheckin = () => {
    fetch('/api/home/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'checkin_complete', arguments: { mood: '不错', notes: '' } }),
    }).catch(() => {})
  }

  const voiceState = sosActive ? 'speaking' : session.voiceState

  return (
    <div className="room-terminal home-elder">
      <header className="terminal-topbar">
        <div className="terminal-clock">
          {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="terminal-date">
          {now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </div>
        <div className="terminal-room">晚晴伴</div>
      </header>

      <main className="terminal-main">
        <VoiceOrb
          state={voiceState}
          level={Math.max(session.inputLevel, session.outputLevel)}
          onClick={() => {
            if (muted) {
              if (session.activateVoice()) setMuted(false)
            } else {
              setMuted(true)
              session.deactivateVoice()
            }
          }}
        />
        <h1 className="terminal-greeting">{greeting(now, address || elder?.name || '')}</h1>
        <p className="terminal-hint">
          {sosActive
            ? '别急，家人已经知道了'
            : muted ? '点上面的圆圈跟我说话，或者按下面的按钮' : session.error || '我在听呢，想聊点什么？'}
        </p>

        {checkinActive && (
          <div className="checkin-banner">
            <span className="call-icon">☀️</span>
            {checkinGreeting(now)}
          </div>
        )}

        {sosActive && (
          <div className={`terminal-call-status tone-${sosAcknowledged ? 'accepted' : 'new'}`}>
            <span className="call-icon">🆘</span>
            {sosAcknowledged
              ? `${state.sos.notified.find(entry => entry.ackAt)?.contact?.name || '家人'}已经看到了，正在过来`
              : `已经通知${state.sos.notified[0]?.relation || '家人'}${state.sos.notified[0]?.contact?.name || ''}了，别着急`}
          </div>
        )}

        {transcript.length > 0 && (
          <div className="terminal-transcript">
            {transcript.slice(-1).map((entry, index) => (
              <p key={`${entry.at}-${index}`} className={`line line-${entry.role}`}>
                {entry.role === 'user' ? '您' : entry.role === 'system' ? '' : '晚晴'}：{entry.content}
              </p>
            ))}
          </div>
        )}
      </main>

      <footer className="terminal-actions home-actions">
        {pendingReminder ? (
          <button type="button" className="action-card medication" onClick={confirmReminder}>
            <span className="action-icon">💊</span>
            <span className="action-title">{pendingReminder.name}</span>
            <span className="action-sub">{pendingReminder.time} · {pendingReminder.note}</span>
            <span className="action-count">做好了点这里</span>
          </button>
        ) : checkinActive ? (
          <button type="button" className="action-card medication done" onClick={triggerCheckin}>
            <span className="action-icon">☀️</span>
            <span className="action-title">聊好啦</span>
            <span className="action-sub">结束今天的问安</span>
          </button>
        ) : (
          <div className="action-card medication done">
            <span className="action-icon">✅</span>
            <span className="action-title">今天的安排都完成啦</span>
          </div>
        )}
        <button
          type="button"
          className={`action-card sos ${sosActive ? 'active' : ''}`}
          onMouseDown={startSosPress}
          onMouseUp={cancelSosPress}
          onMouseLeave={cancelSosPress}
          onTouchStart={startSosPress}
          onTouchEnd={cancelSosPress}
        >
          <span className="action-icon">🆘</span>
          <span className="action-title">{sosActive ? '已通知家人' : '紧急求助'}</span>
          <span className="action-sub">{sosActive ? '保持电话畅通' : '长按 1 秒触发'}</span>
        </button>
      </footer>
    </div>
  )
}
