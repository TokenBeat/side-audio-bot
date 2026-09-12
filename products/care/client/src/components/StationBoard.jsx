// 护理站大屏：3 米可读。房间网格是主角，呼叫队列是行动区。
import { useEffect, useMemo, useState } from 'react'
import useCareState from '../hooks/useCareState'

const STATE_LABEL = {
  safe: '平安',
  calling: '呼叫中',
  reminder: '提醒',
  offline: '离线',
}

const STATE_ICON = {
  safe: '●',
  calling: '🔴',
  reminder: '🟡',
  offline: '○',
}

function waitingMinutes(createdAt, now) {
  return Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60000))
}

function waitingBar(createdAt, now) {
  const minutes = waitingMinutes(createdAt, now)
  const ratio = Math.min(1, minutes / 3)
  const blocks = Math.max(1, Math.round(ratio * 5))
  return '▓'.repeat(blocks) + '░'.repeat(5 - blocks)
}

export default function StationBoard() {
  const { state, activities, connected } = useCareState()
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const openTickets = useMemo(() => (
    (state?.callTickets || []).filter(ticket => ticket.status === 'new' || ticket.status === 'escalated')
  ), [state])

  const acceptedTickets = useMemo(() => (
    (state?.callTickets || []).filter(ticket => ticket.status === 'accepted')
  ), [state])

  const doneToday = useMemo(() => (
    (state?.callTickets || []).filter(ticket => ticket.status === 'done')
  ), [state])

  const avgResponse = useMemo(() => {
    const withResponse = doneToday.filter(ticket => ticket.responseSeconds > 0)
    if (!withResponse.length) return null
    const average = withResponse.reduce((sum, ticket) => sum + ticket.responseSeconds, 0) / withResponse.length
    return Math.round(average)
  }, [doneToday])

  const act = async (action, ticketId) => {
    setBusy(true)
    try {
      await fetch('/api/care/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'call_manage',
          arguments: { action, ticketId, staffName: '小李' },
        }),
      })
    } finally {
      setBusy(false)
    }
  }

  const onDuty = (state?.duty?.staff || []).filter(person => person.onDuty)

  return (
    <div className="station-stage">
      <div className="station-frame">
      <header className="station-topbar">
        <div className="station-brand">
          <span className="brand-mark">晴</span>
          晚晴·照护
          <span className="station-floor">{state?.floor || ''}</span>
        </div>
        <div className={`station-link ${connected ? 'ok' : 'bad'}`}>
          {connected ? '系统在线' : '连接中…'}
        </div>
        <div className="station-clock">
          <span className="station-clock-time">
            {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="station-date">
            {now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </span>
        </div>
        <div className="station-duty">
          当班：<strong>{onDuty.map(person => person.name).join(' ') || '—'}</strong>
        </div>
      </header>

      <div className="station-body">
        <section className="room-grid" aria-label="房间状态">
          {(state?.rooms || []).map(room => {
            const activeTicket = openTickets.find(ticket => ticket.roomId === room.id)
            const nextReminder = (state?.medications?.[room.id]?.items || [])[0]
            const isCalling = room.state === 'calling'
            return (
              <article
                key={room.id}
                className={`room-card state-${room.state} ${isCalling ? 'pulse' : ''}`}
              >
                <div className="room-head">
                  <span className="room-id">{room.id}</span>
                  <span className="room-state">
                    {STATE_ICON[room.state]} {STATE_LABEL[room.state] || room.state}
                  </span>
                </div>
                <div className="room-name">{room.resident.name}</div>
                <div className="room-meta">
                  {room.state === 'reminder' && room.note ? room.note : ''}
                  {!isCalling && room.state === 'safe' && nextReminder ? `💊 ${nextReminder.time} ${nextReminder.name}` : ''}
                  {isCalling && activeTicket ? `${activeTicket.intent} · 等 ${waitingMinutes(activeTicket.createdAt, now)} 分` : ''}
                </div>
                {isCalling && activeTicket && (
                  <div className="room-wait">{waitingBar(activeTicket.createdAt, now)}</div>
                )}
              </article>
            )
          })}
          {!state && <div className="board-loading">正在连接护理站服务…</div>}
        </section>

        <aside className="station-side">
          <h2 className="side-title">⚡ 呼叫队列（{openTickets.length}）</h2>
          <div className="ticket-list">
            {openTickets.map(ticket => (
              <div key={ticket.id} className={`ticket-card ${ticket.urgency === 'urgent' ? 'urgent' : ''} ${ticket.escalated ? 'escalated' : ''}`}>
                <div className="ticket-head">
                  <strong>{ticket.roomId} {ticket.resident}</strong>
                  <span className="ticket-wait">
                    等待 {waitingMinutes(ticket.createdAt, now)} 分 {waitingBar(ticket.createdAt, now)}
                  </span>
                </div>
                <div className="ticket-intent">{ticket.intent}{ticket.urgency === 'urgent' ? ' · 紧急' : ''}</div>
                <div className="ticket-actions">
                  <button type="button" disabled={busy} onClick={() => act('accept', ticket.id)}>受理</button>
                  <button type="button" disabled={busy} onClick={() => act('complete', ticket.id)}>到房完成</button>
                </div>
                {ticket.escalated && <div className="ticket-escalated">⚠️ 超时已升级护士长</div>}
              </div>
            ))}
            {!openTickets.length && (
              <div className="ticket-empty">暂无呼叫，一切平安</div>
            )}
          </div>

          <h2 className="side-title muted">📋 处理中（{acceptedTickets.length}）</h2>
          <div className="ticket-list compact">
            {acceptedTickets.map(ticket => (
              <div key={ticket.id} className="ticket-card accepted">
                <div className="ticket-head">
                  <strong>{ticket.roomId} {ticket.resident}</strong>
                  <span>{ticket.acceptedBy} · {new Date(ticket.acceptedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="ticket-intent">{ticket.intent}</div>
                <div className="ticket-actions">
                  <button type="button" disabled={busy} onClick={() => act('complete', ticket.id)}>完成</button>
                </div>
              </div>
            ))}
            {!acceptedTickets.length && <div className="ticket-empty">没有进行中的任务</div>}
          </div>

          <div className="station-stats">
            今日呼叫 {doneToday.length + openTickets.length + acceptedTickets.length} 次
            {avgResponse != null && <> · 平均响应 {Math.floor(avgResponse / 60)}分{avgResponse % 60}秒</>}
          </div>
        </aside>
      </div>

      <footer className="station-footer">
        <span className="activity-ticker">
          {activities[0]?.message || '晚晴·照护，让每一位老人都被看见'}
        </span>
        <span className="weather-ticker">天气：{state?.weather?.summary || '—'} · 今天 {state?.activities?.map(activity => `${activity.time} ${activity.title}(${activity.attendees.length}人)`).join(' · ') || ''}</span>
      </footer>
      </div>
    </div>
  )
}
