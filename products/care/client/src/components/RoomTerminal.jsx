// 房间终端：老人每天面对的界面。大字、大按钮、一屏一事。
import { useEffect, useMemo, useRef, useState } from 'react'
import useVoiceSession from '../hooks/useVoiceSession'
import useCareState from '../hooks/useCareState'
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
  if (diffMinutes > 0) return `还有${diffMinutes >= 60 ? `${Math.floor(diffMinutes / 60)}小时` : ''}${diffMinutes % 60 ? `${diffMinutes % 60}分` : ''}`
  return '就是现在'
}

export default function RoomTerminal({ roomId = '302' }) {
  const { state } = useCareState()
  const [now, setNow] = useState(() => new Date())
  const [muted, setMuted] = useState(true)
  const [transcript, setTranscript] = useState([])
  const [callStatus, setCallStatus] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
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
        // delta 聚合：同一 responseId 的增量替换最后一条
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
    // 终端心跳：护理站靠它判断在线/离线。
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

  // 工单状态回投：呼叫后监听状态变化，给老人三段式反馈。
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
    }).catch(() => setCallStatus({ tone: 'new', text: '网络不太好，已为您重试中' }))
    setCallStatus({ tone: 'new', text: '已经知道了，别着急' })
  }

  const confirmMedication = () => {
    fetch('/api/care/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'medication_confirm',
        arguments: { roomId, medicationName: medication?.name || '药' },
      }),
    }).catch(() => {})
  }

  return (
    <div className="room-terminal">
      <header className="terminal-topbar">
        <div className="terminal-clock">
          {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="terminal-date">
          {now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
        </div>
        <div className="terminal-room">{roomId} 房 · {residentName}</div>
      </header>

      <main className="terminal-main">
        <VoiceOrb
          state={session.voiceState}
          level={Math.max(session.inputLevel, session.outputLevel)}
          onClick={toggleVoice}
        />
        <h1 className="terminal-greeting">{greeting(now, address || residentName)}</h1>
        <p className="terminal-hint">
          {muted
            ? '点上面的圆圈跟我说话，或者按下面的按钮'
            : session.error || '我在听呢，想聊点什么？'}
        </p>

        {callStatus && (
          <div className={`terminal-call-status tone-${callStatus.tone}`}>
            <span className="call-icon">🔔</span>
            {callStatus.text}
          </div>
        )}

        {transcript.length > 0 && (
          <div className={`terminal-transcript ${showHistory ? 'expanded' : ''}`} ref={transcriptRef}>
            {(showHistory ? transcript : transcript.slice(-1)).map((entry, index) => (
              <p key={`${entry.at}-${index}`} className={`line line-${entry.role}`}>
                {entry.role === 'user' ? '您' : entry.role === 'system' ? '' : '晚晴'}：{entry.content}
              </p>
            ))}
            {transcript.length > 1 && (
              <button type="button" className="history-toggle" onClick={() => setShowHistory(value => !value)}>
                {showHistory ? '收起' : `看之前的对话（${transcript.length - 1}）`}
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="terminal-actions">
        {medication ? (
          <button
            type="button"
            className={`action-card medication ${reminderActive ? 'due' : ''}`}
            onClick={confirmMedication}
          >
            <span className="action-icon">💊</span>
            <span className="action-title">{medication.name}</span>
            <span className="action-sub">{medication.time} · {medication.note}</span>
            <span className="action-count">{reminderActive ? '到时间了，吃好了点这里' : medicationDue}</span>
          </button>
        ) : (
          <div className="action-card medication done">
            <span className="action-icon">💊</span>
            <span className="action-title">今天的药都吃好啦</span>
          </div>
        )}
        <button
          type="button"
          className={`action-card call ${activeCall ? 'active' : ''}`}
          onClick={() => triggerCall()}
        >
          <span className="action-icon">🔔</span>
          <span className="action-title">呼叫护理员</span>
          <span className="action-sub">有事随时按</span>
        </button>
      </footer>
    </div>
  )
}
